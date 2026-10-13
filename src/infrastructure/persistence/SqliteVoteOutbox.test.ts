import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import { ENQUEUE_OUTCOME } from '@application/ports/VoteOutbox';
import { describeVoteOutboxContract } from '@application/testing/contracts/voteOutboxContract';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { OUTBOX_STATUS } from '@domain/entities/OutboxVote';
import { voteUndeliverable } from '@domain/errors/VoteDeliveryError';
import { ok } from '@domain/shared/Result';
import { aPendingVote, aResolutionId, aUserId, aVote, at } from '@domain/testing/builders';

import { databaseDirectory, openTestDatabase } from '../testing/testDatabase';
import type { TestDatabase } from '../testing/testDatabase';

import { COLUMN, TABLE } from './schema';
import { SqliteVoteOutbox } from './SqliteVoteOutbox';

const directory = databaseDirectory();

function harnessOf(test: TestDatabase, monitoring = new FakeMonitoring()) {
  const outbox = new SqliteVoteOutbox({ database: test.database, monitoring });
  return {
    outbox,
    failNextStatement: () => test.faults.failNext(),
    reopen: async () => {
      const reopened = await test.reopen();
      return harnessOf(reopened, monitoring).outbox;
    },
  };
}

describeVoteOutboxContract(
  'SqliteVoteOutbox',
  async () => harnessOf(await openTestDatabase(directory)),
  { failsStatements: true, survivesReopen: true },
);

// What the contract cannot say: the shape of the rows, the checks of the database, and what the
// outbox does with a row that is not a vote.

const VOTER = aUserId('voter-1');

async function openOutbox() {
  const test = await openTestDatabase(directory);
  const monitoring = new FakeMonitoring();
  const outbox = new SqliteVoteOutbox({ database: test.database, monitoring });
  return { test, monitoring, outbox };
}

const pendingVote = (resolution: string, enqueuedAt = at(0)) =>
  aPendingVote(aVote({ resolutionId: aResolutionId(resolution), voterId: VOTER }), enqueuedAt);

const rows = async (test: TestDatabase) =>
  (await test.database.all(`SELECT * FROM ${TABLE.OutboxVotes} ORDER BY ${COLUMN.Sequence}`)).map(
    (row) => ({ ...row }),
  );

describe('SqliteVoteOutbox, on the rows it keeps', () => {
  it('holds a vote in columns, the choice and the status among them, in the order of enqueueing', async () => {
    const { test, outbox } = await openOutbox();
    const first = pendingVote('r1', at(900));
    await outbox.enqueue(first);
    await outbox.enqueue(pendingVote('r2', at(100)));
    await outbox.markAttempt(first.vote.idempotencyKey);

    expect(await rows(test)).toEqual([
      {
        sequence: 1,
        idempotency_key: first.vote.idempotencyKey,
        voter_id: 'voter-1',
        resolution_id: 'r1',
        meeting_id: first.vote.meetingId,
        choice: first.vote.choice,
        cast_at: first.vote.castAt,
        enqueued_at: at(900),
        attempts: 1,
        status: OUTBOX_STATUS.Pending,
        rejection_reason: null,
        rejected_at: null,
      },
      expect.objectContaining({ sequence: 2, resolution_id: 'r2', attempts: 0 }),
    ]);
  });

  it('writes the reason and the instant of a rejection with the status, in the same row', async () => {
    const { test, outbox } = await openOutbox();
    const queued = pendingVote('r1');
    await outbox.enqueue(queued);

    await outbox.reject(queued.vote.idempotencyKey, voteUndeliverable(5), at(77));

    expect(await rows(test)).toEqual([
      expect.objectContaining({
        status: OUTBOX_STATUS.Rejected,
        rejection_reason: JSON.stringify({ code: 'voteUndeliverable', attempts: 5 }),
        rejected_at: at(77),
      }),
    ]);
  });

  it('never gives a number back: a vote enqueued after one was removed has a number of its own', async () => {
    const { test, outbox } = await openOutbox();
    const first = pendingVote('r1');
    await outbox.enqueue(first);
    await outbox.remove(first.vote.idempotencyKey);

    await outbox.enqueue(first);

    expect((await rows(test)).map((row) => row.sequence)).toEqual([2]);
  });

  it.each([
    [
      'a pending vote with a reason',
      `UPDATE ${TABLE.OutboxVotes} SET ${COLUMN.RejectionReason} = '{}'`,
    ],
    [
      'a rejected vote without a reason',
      `UPDATE ${TABLE.OutboxVotes} SET ${COLUMN.Status} = 'rejected'`,
    ],
    ['a status that is neither', `UPDATE ${TABLE.OutboxVotes} SET ${COLUMN.Status} = 'sent'`],
    [
      'a second row with the same key',
      `INSERT INTO ${TABLE.OutboxVotes} SELECT sequence + 100, ${COLUMN.IdempotencyKey}, voter_id, resolution_id, meeting_id, choice, cast_at, enqueued_at, attempts, status, rejection_reason, rejected_at FROM ${TABLE.OutboxVotes}`,
    ],
  ])('is refused by the database: %s', async (_name, statement) => {
    const { test, outbox } = await openOutbox();
    await outbox.enqueue(pendingVote('r1'));

    await expect(test.database.run(statement)).rejects.toThrow();
  });
});

describe('SqliteVoteOutbox, on rows that no longer read back', () => {
  /** Changes a column of the only vote, behind the back of the outbox. */
  async function corruptWith(column: string, value: string | number | null) {
    const { test, monitoring, outbox } = await openOutbox();
    const queued = pendingVote('r1');
    await outbox.enqueue(queued);
    await outbox.enqueue(pendingVote('r2'));
    await test.database.run(
      `UPDATE ${TABLE.OutboxVotes} SET ${column} = ? WHERE ${COLUMN.ResolutionId} = 'r1'`,
      [value],
    );
    return { test, monitoring, outbox, queued };
  }

  it.each([
    ['a choice that is not one', COLUMN.Choice, 'maybe'],
    ['an instant that is not one', COLUMN.EnqueuedAt, -4],
    ['an attempt count that is not whole', COLUMN.Attempts, 1.5],
    ['a key that is not the key of the vote', COLUMN.IdempotencyKey, 'another-key'],
  ])('leaves out a vote with %s, reports it, and deletes it', async (_name, column, value) => {
    const { test, monitoring, outbox } = await corruptWith(column, value);

    const listed = await outbox.list(VOTER);

    expect(listed.ok && listed.value.map((entry) => entry.vote.resolutionId)).toEqual([
      aResolutionId('r2'),
    ]);
    expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowDiscarded]);
    expect(await rows(test)).toHaveLength(1);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['a reason of a kind nobody knows', JSON.stringify({ code: 'somethingElse' })],
    ['a reason without its fields', JSON.stringify({ code: 'alreadyVoted' })],
  ])('leaves out a rejected vote whose reason is %s', async (_name, reason) => {
    const { test, monitoring, outbox } = await openOutbox();
    const queued = pendingVote('r1');
    await outbox.enqueue(queued);
    await outbox.reject(queued.vote.idempotencyKey, { code: 'resolutionClosed' }, at(5));
    await test.database.run(`UPDATE ${TABLE.OutboxVotes} SET ${COLUMN.RejectionReason} = ?`, [
      reason,
    ]);

    const listed = await outbox.list(VOTER);

    expect(listed).toStrictEqual(ok([]));
    expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowDiscarded]);
    expect(await rows(test)).toEqual([]);
  });

  it('reports a row without anything that identifies the vote, the voter or the choice', async () => {
    const { monitoring, outbox } = await corruptWith(COLUMN.Choice, 'maybe');

    await outbox.list(VOTER);

    expect(JSON.stringify(monitoring.errors)).not.toMatch(/maybe|voter-1|resolution|meeting-1/);
    expect(monitoring.errors.map((captured) => captured.attributes)).toEqual([
      { [LOG_ATTRIBUTE.Resource]: 'outboxVote' },
    ]);
  });

  it('enqueues a vote over a row that holds its key but is no vote', async () => {
    const { test, outbox, queued } = await corruptWith(COLUMN.Choice, 'maybe');

    const again = await outbox.enqueue(queued);

    expect(again).toStrictEqual(ok({ outcome: ENQUEUE_OUTCOME.Enqueued }));
    expect(await outbox.findByResolution(aResolutionId('r1'), VOTER)).toStrictEqual(ok([queued]));
    expect(await rows(test)).toHaveLength(2);
  });

  it('still answers when the corrupted row cannot be deleted', async () => {
    const { test, outbox } = await corruptWith(COLUMN.Choice, 'maybe');
    test.faults.failWhileAddingData(false);
    const original = test.database.run.bind(test.database);
    jest
      .spyOn(test.database, 'run')
      .mockImplementation((sql, params) =>
        sql.startsWith('DELETE') ? Promise.reject(new Error('read only')) : original(sql, params),
      );

    const listed = await outbox.list(VOTER);

    expect(listed.ok && listed.value).toHaveLength(1);
  });
});

describe('SqliteVoteOutbox, on a storage that does not answer', () => {
  it('turns every call into a storage error within the time it was given', async () => {
    const test = await openTestDatabase(directory);
    const outbox = new SqliteVoteOutbox({
      database: test.database,
      monitoring: new FakeMonitoring(),
      timeoutMillis: 20,
    });
    const queued = pendingVote('r1');
    test.faults.hang(true);

    const answers = await Promise.all([
      outbox.enqueue(queued),
      outbox.list(VOTER),
      outbox.findByResolution(aResolutionId('r1'), VOTER),
      outbox.markAttempt(queued.vote.idempotencyKey),
      outbox.reject(queued.vote.idempotencyKey, { code: 'resolutionClosed' }, at(1)),
      outbox.remove(queued.vote.idempotencyKey),
    ]);

    expect(answers.map((answer) => !answer.ok && answer.error.cause)).toEqual(
      Array(6).fill('timeout'),
    );
  });
});
