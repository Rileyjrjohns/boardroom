import type { Meeting } from '@domain/entities/Meeting';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import type { Resolution } from '@domain/entities/Resolution';
import type { Vote } from '@domain/entities/Vote';
import { networkUnavailable, unauthorized } from '@domain/errors/RepositoryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { err, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_HOUR,
  aMeeting,
  aMeetingId,
  aResolution,
  aResolutionId,
  anAgendaItem,
  aUserId,
  aVote,
  at,
  unwrap,
} from '@domain/testing/builders';
import type { Instant } from '@domain/value-objects/Instant';
import { parseInstant } from '@domain/value-objects/Instant';
import type { UserId } from '@domain/value-objects/ids';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import type { VoteRepository } from '../../ports/VoteRepository';

/**
 * What the suite needs to test a vote repository. Before the suite starts, the server holds
 * `aMeetingWithAgenda()` (meeting `meeting-1`, whose resolutions are `resolution-1` and
 * `resolution-2`, both open, and where `user-1` is a member) and the requests are authenticated as
 * `user-1`.
 */
export interface VoteRepositoryHarness {
  readonly repository: VoteRepository;
  /** The instant the server takes for the present. */
  readonly now: Instant;
  setOnline(online: boolean): void;
  /** Nobody is authenticated any more. */
  signOut(): void | Promise<void>;
  /** From now on the requests are authenticated as this user. */
  authenticateAs(userId: UserId): void | Promise<void>;
  /** Makes the server hold exactly this meeting, and nothing recorded. For the business rules. */
  serve(meeting: Meeting): void | Promise<void>;
  /** How many votes the server recorded under the key of this vote. */
  recordedCount(vote: Vote): number | Promise<number>;
}

export type VoteRepositoryFactory = () => VoteRepositoryHarness | Promise<VoteRepositoryHarness>;

export interface VoteRepositoryContractOptions {
  /**
   * Whether the server applies the business rules of a vote (closed, not eligible, ...), which
   * means it holds the meetings. The scripted server of the fakes does not.
   */
  readonly enforcesBusinessRules: boolean;
}

const SECRETARY = aUserId('user-3');
const OUTSIDER = aUserId('user-9');

/**
 * The contract of `VoteRepository`, as a suite any implementation runs: idempotent on the
 * idempotency key, a second choice under the same key is `alreadyVoted`, a vote is only recorded
 * for the user the request is authenticated as (`unauthorized` otherwise), failures are results.
 * With `enforcesBusinessRules`, also the business rejections.
 */
export function describeVoteRepositoryContract(
  name: string,
  createHarness: VoteRepositoryFactory,
  options: VoteRepositoryContractOptions,
): void {
  describe(`${name} honours the VoteRepository contract`, () => {
    let harness: VoteRepositoryHarness;
    let repository: VoteRepository;

    beforeEach(async () => {
      harness = await createHarness();
      repository = harness.repository;
    });

    it('records a vote', async () => {
      expect(await repository.submit(aVote())).toStrictEqual(ok(undefined));
      expect(await harness.recordedCount(aVote())).toBe(1);
    });

    it('is idempotent on the key: the same vote sent twice is recorded once, and succeeds both times', async () => {
      expect(await repository.submit(aVote())).toStrictEqual(ok(undefined));
      expect(await repository.submit(aVote())).toStrictEqual(ok(undefined));
      expect(await repository.submit(aVote({ castAt: at(5000) }))).toStrictEqual(ok(undefined));

      expect(await harness.recordedCount(aVote())).toBe(1);
    });

    it('rejects another choice under the same key as already voted, and keeps the first', async () => {
      await repository.submit(aVote({ choice: VOTE_CHOICE.For }));

      expect(await repository.submit(aVote({ choice: VOTE_CHOICE.Against }))).toStrictEqual(
        err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded }),
      );
      expect(await harness.recordedCount(aVote())).toBe(1);
      expect(await repository.submit(aVote({ choice: VOTE_CHOICE.For }))).toStrictEqual(
        ok(undefined),
      );
    });

    it('records one vote per resolution', async () => {
      const second = aVote({ resolutionId: aResolutionId('resolution-2') });

      expect(await repository.submit(aVote())).toStrictEqual(ok(undefined));
      expect(await repository.submit(second)).toStrictEqual(ok(undefined));

      expect(await harness.recordedCount(aVote())).toBe(1);
      expect(await harness.recordedCount(second)).toBe(1);
    });

    describe('only records a vote for the user the request is authenticated as', () => {
      it('answers unauthorized, not a voting error, to the vote of somebody else', async () => {
        const theirs = aVote({ voterId: aUserId('user-2') });

        expect(await repository.submit(theirs)).toStrictEqual(err(unauthorized()));
        expect(await harness.recordedCount(theirs)).toBe(0);
      });

      it('answers unauthorized when nobody is authenticated', async () => {
        await harness.signOut();

        expect(await repository.submit(aVote())).toStrictEqual(err(unauthorized()));
        expect(await harness.recordedCount(aVote())).toBe(0);
      });
    });

    describe('failures are results', () => {
      it('answers networkUnavailable without a connection, records nothing, and recovers', async () => {
        harness.setOnline(false);

        expect(await repository.submit(aVote())).toStrictEqual(err(networkUnavailable()));
        expect(await harness.recordedCount(aVote())).toBe(0);

        harness.setOnline(true);
        expect(await repository.submit(aVote())).toStrictEqual(ok(undefined));
        expect(await harness.recordedCount(aVote())).toBe(1);
      });
    });

    // A server that only replays scripted answers (the fakes) skips these: they show as skipped.
    (options.enforcesBusinessRules ? describe : describe.skip)('business rules', () => {
      /** A meeting whose only resolution is `resolution`, with the standard participants. */
      function meetingWith(resolution: Resolution): Meeting {
        return aMeeting({ agenda: [anAgendaItem({ resolution })] });
      }

      it('rejects a vote on a closed resolution', async () => {
        await harness.serve(meetingWith(aResolution({ status: RESOLUTION_STATUS.Closed })));

        expect(await repository.submit(aVote())).toStrictEqual(
          err({ code: VOTING_ERROR_CODE.ResolutionClosed }),
        );
        expect(await harness.recordedCount(aVote())).toBe(0);
      });

      it('rejects a vote once the closing instant is reached, by the time of the server', async () => {
        const closesAt = unwrap(parseInstant(harness.now - MILLIS_PER_HOUR));
        await harness.serve(meetingWith(aResolution({ closesAt })));

        expect(await repository.submit(aVote({ castAt: at(-10 * MILLIS_PER_HOUR) }))).toStrictEqual(
          err({ code: VOTING_ERROR_CODE.VotingWindowOver }),
        );
      });

      it('accepts a vote while the closing instant is ahead', async () => {
        const closesAt = unwrap(parseInstant(harness.now + MILLIS_PER_HOUR));
        await harness.serve(meetingWith(aResolution({ closesAt })));

        expect(await repository.submit(aVote())).toStrictEqual(ok(undefined));
      });

      it('rejects the vote of a participant whose role carries no vote', async () => {
        await harness.serve(meetingWith(aResolution()));
        await harness.authenticateAs(SECRETARY);

        expect(await repository.submit(aVote({ voterId: SECRETARY }))).toStrictEqual(
          err({ code: VOTING_ERROR_CODE.NoVotingRights }),
        );
      });

      it('rejects the vote of somebody who is not invited to the meeting', async () => {
        await harness.serve(meetingWith(aResolution()));
        await harness.authenticateAs(OUTSIDER);

        expect(await repository.submit(aVote({ voterId: OUTSIDER }))).toStrictEqual(
          err({ code: VOTING_ERROR_CODE.NotAParticipant }),
        );
      });

      it('rejects a vote on a resolution the meeting does not have, or in a meeting it does not hold', async () => {
        await harness.serve(meetingWith(aResolution()));
        const unknown = aResolutionId('does-not-exist');

        expect(await repository.submit(aVote({ resolutionId: unknown }))).toStrictEqual(
          err({ code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: unknown }),
        );
        expect(
          await repository.submit(aVote({ meetingId: aMeetingId('does-not-exist') })),
        ).toStrictEqual(
          err({ code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId() }),
        );
      });
    });
  });
}
