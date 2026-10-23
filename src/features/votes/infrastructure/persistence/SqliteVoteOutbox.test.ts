import { MIGRATIONS } from '@composition/persistence/migrations';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { voteUndeliverable } from '@features/votes/domain/errors/VoteDeliveryError';
import { ok } from '@core/domain/shared/Result';
import type { UserId } from '@core/domain/value-objects/ids';
import { runMigrations } from '@core/infrastructure/persistence/migrate';
import { ENQUEUE_OUTCOME } from '@features/votes/application/ports/VoteOutbox';
import { describeVoteOutboxContract } from '@features/votes/application/testing/contracts/voteOutboxContract';
import { OUTBOX_STATUS, rejectVote } from '@features/votes/domain/entities/OutboxVote';
import type { IdempotencyKey } from '@features/votes/domain/entities/Vote';
import { aPendingVote, aResolutionId, aUserId, aVote, at } from '@testing/domain/builders';
import { databaseDirectory, openTestDatabase } from '@testing/infrastructure/testDatabase';
import type { TestDatabase } from '@testing/infrastructure/testDatabase';

import { SqliteVoteOutbox } from './SqliteVoteOutbox';

import { OUTBOX_QUARANTINED, VOTE_COLUMN, VOTE_INDEX, VOTE_TABLE } from './schema';

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
    // An entry the outbox cannot read as a vote: a choice nobody can make.
    plantUnreadable: async (voter: UserId, key: IdempotencyKey) => {
      await test.database.run(
        `INSERT INTO ${VOTE_TABLE.Outbox}
          (${VOTE_COLUMN.IdempotencyKey}, ${VOTE_COLUMN.VoterId}, ${VOTE_COLUMN.ResolutionId}, ${VOTE_COLUMN.MeetingId},
           ${VOTE_COLUMN.Choice}, ${VOTE_COLUMN.CastAt}, ${VOTE_COLUMN.EnqueuedAt}, ${VOTE_COLUMN.Attempts}, ${VOTE_COLUMN.Status})
          VALUES (?, ?, 'planted', 'planted', 'maybe', 1, 1, 0, 'pending')`,
        [key, voter],
      );
    },
  };
}

describeVoteOutboxContract(
  'SqliteVoteOutbox',
  async () => harnessOf(await openTestDatabase(directory)),
  { failsStatements: true, survivesReopen: true, holdsUnreadable: true },
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
  (
    await test.database.all(`SELECT * FROM ${VOTE_TABLE.Outbox} ORDER BY ${VOTE_COLUMN.Sequence}`)
  ).map((row) => ({ ...row }));

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
      `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.RejectionReason} = '{}'`,
    ],
    [
      'a rejected vote without a reason',
      `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.Status} = 'rejected'`,
    ],
    [
      'a pending vote with an instant of rejection',
      `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.RejectedAt} = 5`,
    ],
    [
      'a rejected vote with a reason and no instant',
      `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.Status} = 'rejected', ${VOTE_COLUMN.RejectionReason} = '{}'`,
    ],
    [
      'a rejected vote with an instant and no reason',
      `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.Status} = 'rejected', ${VOTE_COLUMN.RejectedAt} = 5`,
    ],
    ['a status that is neither', `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.Status} = 'sent'`],
    ['an empty status', `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.Status} = ''`],
    ['no status', `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.Status} = NULL`],
    ['no key', `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.IdempotencyKey} = NULL`],
    ['no voter', `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.VoterId} = NULL`],
    ['no attempts', `UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.Attempts} = NULL`],
    [
      'a second row with the same key',
      `INSERT INTO ${VOTE_TABLE.Outbox} SELECT sequence + 100, ${VOTE_COLUMN.IdempotencyKey}, voter_id, resolution_id, meeting_id, choice, cast_at, enqueued_at, attempts, status, rejection_reason, rejected_at FROM ${VOTE_TABLE.Outbox}`,
    ],
  ])('is refused by the database: %s', async (_name, statement) => {
    const { test, outbox } = await openOutbox();
    await outbox.enqueue(pendingVote('r1'));

    await expect(test.database.run(statement)).rejects.toThrow();
  });
});

describe('SqliteVoteOutbox, on rows that no longer read back', () => {
  /** Changes a column of the vote of r1, behind the back of the outbox. */
  async function corruptWith(column: string, value: string | number | null) {
    const { test, monitoring, outbox } = await openOutbox();
    const queued = pendingVote('r1');
    await outbox.enqueue(queued);
    await outbox.enqueue(pendingVote('r2'));
    await test.database.run(
      `UPDATE ${VOTE_TABLE.Outbox} SET ${column} = ? WHERE ${VOTE_COLUMN.ResolutionId} = 'r1'`,
      [value],
    );
    const corrupted = (await rows(test)).find((row) => row.resolution_id === 'r1');
    return { test, monitoring, outbox, queued, corrupted };
  }

  const CORRUPTIONS = [
    ['a choice that is not one', VOTE_COLUMN.Choice, 'maybe'],
    ['an instant that is not one', VOTE_COLUMN.EnqueuedAt, -4],
    ['an attempt count that is not whole', VOTE_COLUMN.Attempts, 1.5],
    ['a key that is not the key of the vote', VOTE_COLUMN.IdempotencyKey, 'another-key'],
  ] as const;

  describe.each(CORRUPTIONS)('a vote with %s', (_name, column, value) => {
    it('is left out of the votes, counted, and reported', async () => {
      const { monitoring, outbox } = await corruptWith(column, value);

      const listed = await outbox.list(VOTER);

      expect(listed.ok && listed.value.votes.map((entry) => entry.vote.resolutionId)).toEqual([
        aResolutionId('r2'),
      ]);
      expect(listed.ok && listed.value.unreadable).toBe(1);
      expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowQuarantined]);
    });

    it('is kept as it is, with its status the only thing that changed', async () => {
      const { test, outbox, corrupted } = await corruptWith(column, value);

      await outbox.list(VOTER);

      const kept = (await rows(test)).find((row) => row.resolution_id === 'r1');
      expect(await rows(test)).toHaveLength(2);
      expect(kept).toEqual({ ...corrupted, status: OUTBOX_QUARANTINED });
    });

    it('is reported once: the next read finds it quarantined and says nothing', async () => {
      const { monitoring, outbox } = await corruptWith(column, value);

      await outbox.list(VOTER);
      const again = await outbox.list(VOTER);

      expect(again.ok && again.value.unreadable).toBe(1);
      expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowQuarantined]);
    });
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['a reason of a kind nobody knows', JSON.stringify({ code: 'somethingElse' })],
    ['a reason without its fields', JSON.stringify({ code: 'alreadyVoted' })],
  ])('keeps a rejected vote whose reason is %s, out of the votes', async (_name, reason) => {
    const { test, monitoring, outbox } = await openOutbox();
    const queued = pendingVote('r1');
    await outbox.enqueue(queued);
    await outbox.reject(queued.vote.idempotencyKey, { code: 'resolutionClosed' }, at(5));
    await test.database.run(`UPDATE ${VOTE_TABLE.Outbox} SET ${VOTE_COLUMN.RejectionReason} = ?`, [
      reason,
    ]);

    const listed = await outbox.list(VOTER);

    expect(listed).toStrictEqual(ok({ votes: [], unreadable: 1 }));
    expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowQuarantined]);
    expect(await rows(test)).toEqual([
      expect.objectContaining({ status: OUTBOX_QUARANTINED, rejection_reason: reason }),
    ]);
  });

  it('reports a row without anything that identifies the vote, the voter or the choice', async () => {
    const { monitoring, outbox } = await corruptWith(VOTE_COLUMN.Choice, 'maybe');

    await outbox.list(VOTER);

    expect(JSON.stringify(monitoring.errors)).not.toMatch(/maybe|voter-1|resolution|meeting-1/);
    expect(monitoring.errors.map((captured) => captured.attributes)).toEqual([
      { [LOG_ATTRIBUTE.Resource]: 'outboxVote' },
    ]);
  });

  it('does not overwrite a row that holds the key of a vote but is no vote: the vote is refused, the row kept', async () => {
    const { test, monitoring, outbox, queued, corrupted } = await corruptWith(
      VOTE_COLUMN.Choice,
      'maybe',
    );

    const again = await outbox.enqueue(queued);

    expect(again).toStrictEqual(ok({ outcome: ENQUEUE_OUTCOME.HeldByUnreadable }));
    expect(await rows(test)).toHaveLength(2);
    expect((await rows(test)).find((row) => row.resolution_id === 'r1')).toEqual({
      ...corrupted,
      status: OUTBOX_QUARANTINED,
    });
    expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowQuarantined]);
    expect(await outbox.findByResolution(aResolutionId('r1'), VOTER)).toStrictEqual(ok([]));
  });

  it('still answers when the row cannot be marked: it is left out and counted all the same', async () => {
    const { test, outbox } = await corruptWith(VOTE_COLUMN.Choice, 'maybe');
    const original = test.database.run.bind(test.database);
    jest
      .spyOn(test.database, 'run')
      .mockImplementation((sql, params) =>
        sql.startsWith('UPDATE') ? Promise.reject(new Error('read only')) : original(sql, params),
      );

    const listed = await outbox.list(VOTER);

    expect(listed.ok && listed.value.votes).toHaveLength(1);
    expect(listed.ok && listed.value.unreadable).toBe(1);
    expect(await rows(test)).toHaveLength(2);
  });

  it('is deleted by a discard that asks for it, whether or not a read had marked it', async () => {
    const { test, monitoring, outbox } = await corruptWith(VOTE_COLUMN.Choice, 'maybe');

    const discarded = await outbox.discardUnreadable(VOTER);

    expect(discarded).toStrictEqual(ok(1));
    expect((await rows(test)).map((row) => row.resolution_id)).toEqual(['r2']);
    expect(monitoring.errors).toEqual([]);
  });

  it('is not deleted by the removal of the key it sits under', async () => {
    const { test, outbox, queued } = await corruptWith(VOTE_COLUMN.Choice, 'maybe');
    await outbox.list(VOTER);

    await outbox.remove(queued.vote.idempotencyKey);

    expect(await rows(test)).toHaveLength(2);
  });

  it('is attributed by the voter column, whatever else the row holds', async () => {
    const { test, outbox } = await corruptWith(VOTE_COLUMN.Choice, 'maybe');

    const other = await outbox.list(aUserId('voter-2'));

    expect(other).toStrictEqual(ok({ votes: [], unreadable: 0 }));
    expect(await test.database.all(`SELECT count(*) AS total FROM ${VOTE_TABLE.Outbox}`)).toEqual([
      { total: 2 },
    ]);
  });
});

describe('SqliteVoteOutbox, after the migration that makes room for quarantined rows', () => {
  const BEFORE = MIGRATIONS.slice(0, 2);

  it('keeps the votes of a database at version 2, their numbers, and the next number to give', async () => {
    const test = await openTestDatabase(directory, BEFORE);
    const old = new SqliteVoteOutbox({ database: test.database, monitoring: new FakeMonitoring() });
    const first = pendingVote('r1', at(1));
    const second = pendingVote('r2', at(2));
    const third = pendingVote('r3', at(3));
    for (const queued of [first, second, third]) await old.enqueue(queued);
    await old.reject(second.vote.idempotencyKey, voteUndeliverable(5), at(9));
    await old.remove(third.vote.idempotencyKey);

    const migrated = await runMigrations(test.database, MIGRATIONS);
    const outbox = new SqliteVoteOutbox({
      database: test.database,
      monitoring: new FakeMonitoring(),
    });
    const next = pendingVote('r4', at(4));
    await outbox.enqueue(next);

    expect(migrated).toStrictEqual(
      ok({ version: MIGRATIONS.length, applied: MIGRATIONS.length - BEFORE.length }),
    );
    expect(await outbox.list(VOTER)).toStrictEqual(
      ok({
        votes: [first, rejectVote(second, voteUndeliverable(5), at(9)), next],
        unreadable: 0,
      }),
    );
    // The number of the vote that was removed is not given again.
    expect((await rows(test)).map((row) => row.sequence)).toEqual([1, 2, 4]);
  });

  it('keeps the index that finds the votes on a resolution', async () => {
    const test = await openTestDatabase(directory);

    const indexes = await test.database.all(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${VOTE_TABLE.Outbox}'`,
    );

    expect(indexes.map((row) => row.name)).toContain(VOTE_INDEX.OutboxByResolution);
  });

  it('leaves no table behind that the migration used', async () => {
    const test = await openTestDatabase(directory);

    const tables = await test.database.all(`SELECT name FROM sqlite_master WHERE type = 'table'`);

    expect(tables.map((row) => row.name)).not.toContain(VOTE_TABLE.OutboxRebuilt);
  });

  it.each([
    [
      'a quarantined row with nothing in it that a vote has',
      `INSERT INTO ${VOTE_TABLE.Outbox} (idempotency_key, voter_id, resolution_id, meeting_id, choice, cast_at, enqueued_at, attempts, status) VALUES ('k', 'v', 'r', 'm', 'maybe', 'yesterday', 'x', 'many', 'quarantined')`,
    ],
    [
      'a quarantined row with a reason and an instant',
      `INSERT INTO ${VOTE_TABLE.Outbox} (idempotency_key, voter_id, resolution_id, meeting_id, choice, cast_at, enqueued_at, attempts, status, rejection_reason, rejected_at) VALUES ('k', 'v', 'r', 'm', 'for', 1, 1, 0, 'quarantined', '{}', 5)`,
    ],
  ])('accepts %s', async (_name, statement) => {
    const test = await openTestDatabase(directory);

    await expect(test.database.run(statement)).resolves.toEqual({ changes: 1 });
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
      outbox.discardUnreadable(VOTER),
      outbox.findByResolution(aResolutionId('r1'), VOTER),
      outbox.markAttempt(queued.vote.idempotencyKey),
      outbox.reject(queued.vote.idempotencyKey, { code: 'resolutionClosed' }, at(1)),
      outbox.remove(queued.vote.idempotencyKey),
    ]);

    expect(answers.map((answer) => !answer.ok && answer.error.cause)).toEqual(
      Array(7).fill('timeout'),
    );
  });
});
