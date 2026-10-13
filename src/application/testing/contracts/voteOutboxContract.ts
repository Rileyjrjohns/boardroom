import { OUTBOX_STATUS, rejectVote } from '@domain/entities/OutboxVote';
import type { OutboxVote } from '@domain/entities/OutboxVote';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import type { AlreadyVotedError } from '@domain/errors/VotingError';
import { voteUndeliverable } from '@domain/errors/VoteDeliveryError';
import { ok } from '@domain/shared/Result';
import {
  aPendingVote,
  aRejectedVote,
  aResolutionId,
  aUserId,
  aVote,
  at,
} from '@domain/testing/builders';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';

import { ENQUEUE_OUTCOME } from '../../ports/VoteOutbox';
import type { VoteOutbox } from '../../ports/VoteOutbox';

import { mutable } from './support';

export type VoteOutboxFactory = () => VoteOutbox | Promise<VoteOutbox>;

const VOTER = aUserId('voter-1');
const OTHER_VOTER = aUserId('voter-2');

const vote = (resolution: string, voter = VOTER, choice: VoteChoice = VOTE_CHOICE.For) =>
  aVote({ resolutionId: aResolutionId(resolution), voterId: voter, choice });
const pending = (resolution: string, enqueuedAt = at(0), voter = VOTER) =>
  aPendingVote(vote(resolution, voter), enqueuedAt);

/**
 * The contract of `VoteOutbox`, as a suite any implementation runs: first in, first out, reads
 * scoped by voter, the idempotent writes (`enqueue`, `reject`, `remove`) and the one that is not
 * (`markAttempt`), the two states a vote can be in, and no reference kept to what goes in or out.
 * The factory returns a fresh, empty outbox.
 */
export function describeVoteOutboxContract(name: string, createOutbox: VoteOutboxFactory): void {
  describe(`${name} honours the VoteOutbox contract`, () => {
    let outbox: VoteOutbox;

    beforeEach(async () => {
      outbox = await createOutbox();
    });

    describe('enqueue and list', () => {
      it('lists nothing for a voter who has no vote', async () => {
        expect(await outbox.list(VOTER)).toStrictEqual(ok([]));
        expect(await outbox.findByResolution(aResolutionId('r1'), VOTER)).toStrictEqual(ok([]));
      });

      it('enqueues a vote and gives it back as it was', async () => {
        const queued = aPendingVote(vote('r1'), at(5));

        expect(await outbox.enqueue(queued)).toStrictEqual(
          ok({ outcome: ENQUEUE_OUTCOME.Enqueued }),
        );

        expect(await outbox.list(VOTER)).toStrictEqual(ok([queued]));
      });

      it('keeps the attempts a vote already counts when it is enqueued', async () => {
        const attempted = { ...aPendingVote(vote('r1'), at(5)), attempts: 3 };

        await outbox.enqueue(attempted);

        expect(await outbox.list(VOTER)).toStrictEqual(ok([attempted]));
      });

      it('lists the votes in the order they were enqueued, which no sort of the votes would give', async () => {
        // Enqueued in this order, the votes are in decreasing order of instant and in no order of
        // resolution: a sort by instant (oldest first), by resolution, or by key gives another.
        const first = pending('r9', at(5000));
        const second = pending('r1', at(1000));
        const third = pending('r5', at(-9000));

        await outbox.enqueue(first);
        await outbox.enqueue(second);
        await outbox.enqueue(third);

        expect(await outbox.list(VOTER)).toStrictEqual(ok([first, second, third]));
      });

      it('answers that a vote with the same key is already queued, and changes nothing', async () => {
        const first = pending('r1', at(1));
        await outbox.enqueue(first);
        await outbox.enqueue(pending('r2', at(2)));

        const again = await outbox.enqueue(
          aPendingVote(vote('r1', VOTER, VOTE_CHOICE.Against), at(3)),
        );

        expect(again).toStrictEqual(
          ok({ outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing: first }),
        );
        expect(await outbox.list(VOTER)).toStrictEqual(ok([first, pending('r2', at(2))]));
      });

      it('holds the key of a rejected vote too: it answers with the rejected vote', async () => {
        await outbox.enqueue(pending('r1', at(1)));
        await outbox.reject(
          pending('r1').vote.idempotencyKey,
          { code: VOTING_ERROR_CODE.ResolutionClosed },
          at(9),
        );
        const rejected = await outbox.list(VOTER);

        const again = await outbox.enqueue(pending('r1', at(3)));

        expect(again).toStrictEqual(
          ok({
            outcome: ENQUEUE_OUTCOME.AlreadyQueued,
            existing: rejected.ok ? rejected.value[0] : undefined,
          }),
        );
        expect(await outbox.list(VOTER)).toStrictEqual(rejected);
      });
    });

    describe('findByResolution', () => {
      it('returns the vote of a resolution whatever its state: pending, and rejected', async () => {
        const queued = pending('r1', at(1));
        await outbox.enqueue(queued);
        expect(await outbox.findByResolution(aResolutionId('r1'), VOTER)).toStrictEqual(
          ok([queued]),
        );

        await outbox.reject(
          queued.vote.idempotencyKey,
          { code: VOTING_ERROR_CODE.ResolutionClosed },
          at(9),
        );

        const found = await outbox.findByResolution(aResolutionId('r1'), VOTER);
        expect(found).toStrictEqual(
          ok([rejectVote(queued, { code: VOTING_ERROR_CODE.ResolutionClosed }, at(9))]),
        );
      });
    });

    describe('reads scoped by voter', () => {
      it('only ever returns the votes of the voter it is asked for', async () => {
        const mine = pending('r1', at(1));
        const theirs = pending('r1', at(2), OTHER_VOTER);
        const alsoMine = pending('r2', at(3));
        await outbox.enqueue(mine);
        await outbox.enqueue(theirs);
        await outbox.enqueue(alsoMine);

        expect(await outbox.list(VOTER)).toStrictEqual(ok([mine, alsoMine]));
        expect(await outbox.list(OTHER_VOTER)).toStrictEqual(ok([theirs]));
        expect(await outbox.list(aUserId('voter-3'))).toStrictEqual(ok([]));
        expect(await outbox.findByResolution(aResolutionId('r1'), VOTER)).toStrictEqual(ok([mine]));
        expect(await outbox.findByResolution(aResolutionId('r1'), OTHER_VOTER)).toStrictEqual(
          ok([theirs]),
        );
        expect(await outbox.findByResolution(aResolutionId('r2'), OTHER_VOTER)).toStrictEqual(
          ok([]),
        );
      });

      it('queues the same resolution for two voters without one taking the key of the other', async () => {
        const mine = pending('r1', at(1));
        const theirs = pending('r1', at(2), OTHER_VOTER);

        expect(await outbox.enqueue(mine)).toStrictEqual(ok({ outcome: ENQUEUE_OUTCOME.Enqueued }));
        expect(await outbox.enqueue(theirs)).toStrictEqual(
          ok({ outcome: ENQUEUE_OUTCOME.Enqueued }),
        );
      });
    });

    describe('the whole idempotency key identifies a vote', () => {
      // The key is `<length of the resolution id>.<resolution id>.<voter id>`: these pairs make
      // keys that share a long prefix, or differ only in case or in an inner dot.
      const similar = [
        ['r1', 'user-1'],
        ['r1', 'user-10'],
        ['r1', 'user-1.0'],
        ['r1', 'USER-1'],
        ['r1.user-1', 'x'],
        ['r', '1.user-1'],
      ] as const;
      const queued = (resolution: string, voter: string, enqueuedAt = at(0)) =>
        aPendingVote(vote(resolution, aUserId(voter)), enqueuedAt);

      it('enqueues each of them as a vote of its own, and lists each one for its voter only', async () => {
        for (const [resolution, voter] of similar) {
          expect(await outbox.enqueue(queued(resolution, voter))).toStrictEqual(
            ok({ outcome: ENQUEUE_OUTCOME.Enqueued }),
          );
        }

        for (const [resolution, voter] of similar) {
          expect(await outbox.list(aUserId(voter))).toStrictEqual(ok([queued(resolution, voter)]));
        }
      });

      it('treats resolution ids that differ only in case as two resolutions', async () => {
        await outbox.enqueue(queued('r1', 'user-1', at(1)));

        expect(await outbox.enqueue(queued('R1', 'user-1', at(2)))).toStrictEqual(
          ok({ outcome: ENQUEUE_OUTCOME.Enqueued }),
        );
        expect(await outbox.findByResolution(aResolutionId('R1'), aUserId('user-1'))).toStrictEqual(
          ok([queued('R1', 'user-1', at(2))]),
        );
      });

      it('removes, counts an attempt on, and rejects only the vote whose key it is given', async () => {
        for (const [resolution, voter] of similar) await outbox.enqueue(queued(resolution, voter));
        const [first, second, ...others] = similar;
        const target = queued(first[0], first[1]);

        await outbox.markAttempt(target.vote.idempotencyKey);
        await outbox.reject(
          queued(second[0], second[1]).vote.idempotencyKey,
          { code: VOTING_ERROR_CODE.ResolutionClosed },
          at(9),
        );
        await outbox.remove(queued(others[0][0], others[0][1]).vote.idempotencyKey);

        expect(await outbox.list(aUserId(first[1]))).toStrictEqual(
          ok([{ ...target, attempts: 1 }]),
        );
        const rejected = await outbox.list(aUserId(second[1]));
        expect(rejected.ok && rejected.value.map((entry) => entry.status)).toEqual([
          OUTBOX_STATUS.Rejected,
        ]);
        expect(await outbox.list(aUserId(others[0][1]))).toStrictEqual(ok([]));
        for (const [resolution, voter] of others.slice(1)) {
          expect(await outbox.list(aUserId(voter))).toStrictEqual(ok([queued(resolution, voter)]));
        }
      });
    });

    describe('markAttempt', () => {
      it('counts one more attempt every time it is called: it is not idempotent', async () => {
        const queued = pending('r1');
        await outbox.enqueue(queued);

        await outbox.markAttempt(queued.vote.idempotencyKey);
        await outbox.markAttempt(queued.vote.idempotencyKey);

        expect(await outbox.list(VOTER)).toStrictEqual(ok([{ ...queued, attempts: 2 }]));
      });

      it('does nothing for an unknown key, and for a vote that is rejected', async () => {
        const rejected = pending('r1');
        await outbox.enqueue(rejected);
        await outbox.reject(
          rejected.vote.idempotencyKey,
          { code: VOTING_ERROR_CODE.ResolutionClosed },
          at(9),
        );
        const before = await outbox.list(VOTER);

        expect(await outbox.markAttempt(rejected.vote.idempotencyKey)).toStrictEqual(ok(undefined));
        expect(await outbox.markAttempt(vote('unknown').idempotencyKey)).toStrictEqual(
          ok(undefined),
        );

        expect(await outbox.list(VOTER)).toStrictEqual(before);
      });
    });

    describe('reject', () => {
      it('moves a pending vote to the rejected state with its reason and instant, in the same place', async () => {
        const first = pending('r1', at(1));
        const second = pending('r2', at(2));
        const third = pending('r3', at(3));
        for (const queued of [first, second, third]) await outbox.enqueue(queued);
        const reason = { code: VOTING_ERROR_CODE.ResolutionClosed } as const;

        expect(await outbox.reject(second.vote.idempotencyKey, reason, at(10))).toStrictEqual(
          ok(undefined),
        );

        const expected: OutboxVote = {
          status: OUTBOX_STATUS.Rejected,
          vote: second.vote,
          enqueuedAt: second.enqueuedAt,
          attempts: 0,
          reason,
          rejectedAt: at(10),
        };
        expect(await outbox.list(VOTER)).toStrictEqual(ok([first, expected, third]));
      });

      it('keeps the attempts a vote counted, and every kind of reason with its fields', async () => {
        const queued = pending('r1');
        const other = pending('r2');
        await outbox.enqueue(queued);
        await outbox.enqueue(other);
        await outbox.markAttempt(queued.vote.idempotencyKey);
        await outbox.markAttempt(queued.vote.idempotencyKey);
        const undeliverable = voteUndeliverable(5);
        const alreadyVoted = {
          code: VOTING_ERROR_CODE.AlreadyVoted,
          source: ALREADY_VOTED_SOURCE.Recorded,
        } as const;

        await outbox.reject(queued.vote.idempotencyKey, undeliverable, at(10));
        await outbox.reject(other.vote.idempotencyKey, alreadyVoted, at(11));

        expect(await outbox.list(VOTER)).toStrictEqual(
          ok([
            rejectVote({ ...queued, attempts: 2 }, undeliverable, at(10)),
            rejectVote(other, alreadyVoted, at(11)),
          ]),
        );
      });

      it('rejects once: a second rejection, and an unknown key, change nothing', async () => {
        const queued = pending('r1');
        await outbox.enqueue(queued);
        const reason = { code: VOTING_ERROR_CODE.ResolutionClosed } as const;
        await outbox.reject(queued.vote.idempotencyKey, reason, at(10));
        const before = await outbox.list(VOTER);

        expect(
          await outbox.reject(
            queued.vote.idempotencyKey,
            { code: VOTING_ERROR_CODE.NoVotingRights },
            at(20),
          ),
        ).toStrictEqual(ok(undefined));
        expect(await outbox.reject(vote('unknown').idempotencyKey, reason, at(30))).toStrictEqual(
          ok(undefined),
        );

        expect(await outbox.list(VOTER)).toStrictEqual(before);
      });
    });

    describe('remove', () => {
      it('removes a vote, pending or rejected, and leaves the others in order', async () => {
        const first = pending('r1', at(1));
        const rejected = pending('r2', at(2));
        const last = pending('r3', at(3));
        for (const queued of [first, rejected, last]) await outbox.enqueue(queued);
        await outbox.reject(
          rejected.vote.idempotencyKey,
          { code: VOTING_ERROR_CODE.ResolutionClosed },
          at(9),
        );

        await outbox.remove(rejected.vote.idempotencyKey);
        await outbox.remove(first.vote.idempotencyKey);

        expect(await outbox.list(VOTER)).toStrictEqual(ok([last]));
      });

      it('succeeds for an unknown key, and frees the key of a vote it removed', async () => {
        const queued = pending('r1');
        await outbox.enqueue(queued);

        expect(await outbox.remove(vote('unknown').idempotencyKey)).toStrictEqual(ok(undefined));
        await outbox.remove(queued.vote.idempotencyKey);
        await outbox.remove(queued.vote.idempotencyKey);

        expect(await outbox.enqueue(queued)).toStrictEqual(
          ok({ outcome: ENQUEUE_OUTCOME.Enqueued }),
        );
      });

      it('does not touch the votes of another voter', async () => {
        const mine = pending('r1', at(1));
        const theirs = pending('r1', at(2), OTHER_VOTER);
        await outbox.enqueue(mine);
        await outbox.enqueue(theirs);

        await outbox.remove(mine.vote.idempotencyKey);

        expect(await outbox.list(OTHER_VOTER)).toStrictEqual(ok([theirs]));
      });
    });

    describe('keeps no reference to the objects that go in or out', () => {
      it('is not changed by a change of the vote after it was enqueued', async () => {
        const queued = pending('r1');
        await outbox.enqueue(queued);

        mutable(queued).attempts = 99;
        mutable(queued.vote).choice = VOTE_CHOICE.Against;

        expect(await outbox.list(VOTER)).toStrictEqual(ok([pending('r1')]));
      });

      it('is not changed by a change of the votes after they were listed', async () => {
        await outbox.enqueue(pending('r1'));
        const listed = await outbox.list(VOTER);

        if (listed.ok) {
          for (const entry of listed.value) {
            mutable(entry).attempts = 99;
            mutable(entry.vote).choice = VOTE_CHOICE.Abstain;
          }
          (listed.value as OutboxVote[]).length = 0;
        }

        expect(await outbox.list(VOTER)).toStrictEqual(ok([pending('r1')]));
        const found = await outbox.findByResolution(aResolutionId('r1'), VOTER);
        if (found.ok) mutable(found.value[0]?.vote ?? aVote()).choice = VOTE_CHOICE.Abstain;
        expect(await outbox.findByResolution(aResolutionId('r1'), VOTER)).toStrictEqual(
          ok([pending('r1')]),
        );
      });

      it('is not changed by a change of the vote it answered a duplicate with', async () => {
        await outbox.enqueue(pending('r1'));
        const again = await outbox.enqueue(pending('r1', at(2)));

        if (again.ok && again.value.outcome === ENQUEUE_OUTCOME.AlreadyQueued) {
          mutable(again.value.existing).attempts = 99;
        }

        expect(await outbox.list(VOTER)).toStrictEqual(ok([pending('r1')]));
      });

      it('is not changed by a change of the reason after it was given to reject', async () => {
        const queued = pending('r1');
        await outbox.enqueue(queued);
        const reason = {
          code: VOTING_ERROR_CODE.AlreadyVoted,
          source: ALREADY_VOTED_SOURCE.Recorded,
        } as const;
        const given: AlreadyVotedError = { ...reason };
        await outbox.reject(queued.vote.idempotencyKey, given, at(10));

        mutable(given).source = ALREADY_VOTED_SOURCE.Queued;

        expect(await outbox.list(VOTER)).toStrictEqual(ok([rejectVote(queued, reason, at(10))]));
      });
    });

    it('lists a rejected vote as the entry the test builders produce for one', async () => {
      const rejected = aRejectedVote(vote('r1'));
      const queued = aPendingVote(vote('r1'), rejected.enqueuedAt);
      await outbox.enqueue(queued);
      await outbox.reject(queued.vote.idempotencyKey, rejected.reason, rejected.rejectedAt);

      expect(await outbox.list(VOTER)).toStrictEqual(ok([rejected]));
    });
  });
}
