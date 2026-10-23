import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import {
  appLocked,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from '@features/auth/domain/errors/AuthenticationError';
import { networkUnavailable, unauthorized, unexpected } from '@core/domain/errors/RepositoryError';
import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import { voteUndeliverable } from '@features/votes/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import type { VotingError } from '@features/votes/domain/errors/VotingError';
import { err, ok } from '@core/domain/shared/Result';
import { findResolution } from '@features/meetings/domain/entities/Meeting';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { OUTBOX_STATUS } from '@features/votes/domain/entities/OutboxVote';
import type { OutboxVote } from '@features/votes/domain/entities/OutboxVote';
import { createFakes } from '@testing/application/createFakes';
import {
  NOW,
  aMeeting,
  aMeetingId,
  aPendingVote,
  aRejectedVote,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
  anEmail,
  at,
} from '@testing/domain/builders';

import { FakeVoteOutbox } from '../testing/FakeVoteOutbox';

import { SYNC_OUTCOME, SyncPendingVotes } from './SyncPendingVotes';

/**
 * Three votes of user-1, on three resolutions, queued oldest first. Each was cast, and queued,
 * before the clock of the tests (`NOW`) started: a run that stamped a vote with the clock again
 * would send another instant than the one it was cast at.
 */
const FIRST = aPendingVote(
  aVote({ resolutionId: aResolutionId('r1'), castAt: at(-3000) }),
  at(-3000),
);
const SECOND = aPendingVote(
  aVote({ resolutionId: aResolutionId('r2'), choice: VOTE_CHOICE.Against, castAt: at(-2000) }),
  at(-2000),
);
const THIRD = aPendingVote(
  aVote({ resolutionId: aResolutionId('r3'), choice: VOTE_CHOICE.Abstain, castAt: at(-1000) }),
  at(-1000),
);

const CLOSED: VotingError = { code: VOTING_ERROR_CODE.ResolutionClosed };

/** The resolutions of some votes: what a report names. */
const ids = (...entries: OutboxVote[]) => entries.map(({ vote }) => vote.resolutionId);

function setup(...entries: OutboxVote[]) {
  const fakes = createFakes();
  fakes.outbox.seed(...entries);
  return { fakes, useCase: new SyncPendingVotes(fakes) };
}

/** What the outbox holds for each key: its status and attempts. */
function states(fakes: ReturnType<typeof createFakes>) {
  return fakes.outbox
    .snapshot()
    .map((entry) => [entry.vote.resolutionId, entry.status, entry.attempts]);
}

describe('SyncPendingVotes', () => {
  describe('when everything goes through', () => {
    it('sends the votes oldest first and empties the outbox', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND, THIRD);

      const result = await useCase.execute();

      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Completed,
          synced: ids(FIRST, SECOND, THIRD),
          rejected: [],
          remaining: 0,
        }),
      );
      expect(fakes.votes.received).toEqual([FIRST.vote, SECOND.vote, THIRD.vote]);
      expect(fakes.votes.recordedVotes()).toEqual([FIRST.vote, SECOND.vote, THIRD.vote]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('sends each vote as it was cast: the instant of the cast is not renewed by the clock', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.clock.advance(90_000);

      await useCase.execute();

      expect(fakes.votes.received.map(({ castAt }) => castAt)).toEqual([at(-3000), at(-2000)]);
      expect(fakes.votes.recordedVotes().map(({ castAt }) => castAt)).toEqual([
        at(-3000),
        at(-2000),
      ]);
    });

    it('sends the votes in the order of the outbox, which neither their resolution ids nor their instants would give', async () => {
      const queuedFirst = aPendingVote(
        aVote({ resolutionId: aResolutionId('r9'), castAt: at(-500) }),
        at(-3000),
      );
      const queuedSecond = aPendingVote(
        aVote({ resolutionId: aResolutionId('r1'), castAt: at(-9000) }),
        at(-2000),
      );
      const queuedThird = aPendingVote(
        aVote({ resolutionId: aResolutionId('r5'), castAt: at(-4000) }),
        at(-1000),
      );
      const { fakes, useCase } = setup(queuedFirst, queuedSecond, queuedThird);

      await useCase.execute();

      expect(fakes.votes.received).toEqual([queuedFirst.vote, queuedSecond.vote, queuedThird.vote]);
    });

    it('has nothing to do with an empty outbox', async () => {
      const { fakes, useCase } = setup();

      expect(await useCase.execute()).toEqual(
        ok({ outcome: SYNC_OUTCOME.Completed, synced: [], rejected: [], remaining: 0 }),
      );
      expect(fakes.votes.received).toEqual([]);
    });

    it('logs a summary with counts only', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);

      await useCase.execute();

      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Info,
          event: MONITORING_EVENT.VoteSyncCompleted,
          attributes: {
            [LOG_ATTRIBUTE.Synced]: 2,
            [LOG_ATTRIBUTE.Rejected]: 0,
            [LOG_ATTRIBUTE.Remaining]: 0,
          },
        },
      ]);
    });
  });

  describe('the cached meeting of a vote the server recorded', () => {
    const cachedChoice = async (fakes: ReturnType<typeof createFakes>) => {
      const cached = await fakes.meetingCache.readMeeting(aUserId(), aMeetingId());
      return cached.ok && cached.value
        ? findResolution(cached.value.value, aResolutionId('resolution-1'))?.recordedVote
        : undefined;
    };

    it('shows the vote after the synchronisation, and keeps its date', async () => {
      const { fakes, useCase } = setup(
        aPendingVote(aVote({ choice: VOTE_CHOICE.Against, resolutionId: aResolutionId() })),
      );
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), at(-5000));

      await useCase.execute();

      expect(await cachedChoice(fakes)).toBe(VOTE_CHOICE.Against);
      const cached = await fakes.meetingCache.readMeeting(aUserId(), aMeetingId());
      expect(cached.ok && cached.value?.cachedAt).toBe(at(-5000));
    });

    it('is fine when the meeting is not cached', async () => {
      const { fakes, useCase } = setup(FIRST);

      const result = await useCase.execute();

      expect(result.ok && result.value.outcome).toBe(SYNC_OUTCOME.Completed);
      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('does not fail the run when the cache cannot be written, and captures it', async () => {
      const { fakes, useCase } = setup(aPendingVote(aVote({ resolutionId: aResolutionId() })));
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.meetingCache.writeFailure = storageWriteFailed();

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({ outcome: SYNC_OUTCOME.Completed });
      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CacheWriteFailed]);
    });

    it('is not touched by a vote that did not go through', async () => {
      const { fakes, useCase } = setup(aPendingVote(aVote({ resolutionId: aResolutionId() })));
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.network.goOffline();

      await useCase.execute();

      expect(await cachedChoice(fakes)).toBeUndefined();
    });
  });

  describe('when the server rejects a vote for a business reason', () => {
    it('keeps it in the outbox as rejected, with its reason, and carries on', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
      fakes.clock.advance(1000);
      fakes.votes.answerNext(ok(undefined));
      fakes.votes.answerNext(err(CLOSED));

      const result = await useCase.execute();

      const rejected = {
        status: OUTBOX_STATUS.Rejected,
        vote: SECOND.vote,
        enqueuedAt: SECOND.enqueuedAt,
        attempts: 0,
        reason: CLOSED,
        rejectedAt: at(1000),
      };
      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Completed,
          synced: ids(FIRST, THIRD),
          rejected: [{ resolutionId: SECOND.vote.resolutionId, reason: CLOSED }],
          remaining: 0,
        }),
      );
      expect(fakes.outbox.snapshot()).toEqual([rejected]);
    });

    it.each<VotingError>([
      { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
      { code: VOTING_ERROR_CODE.NotAParticipant },
      { code: VOTING_ERROR_CODE.VotingWindowOver },
    ])('treats %p as a rejection too, and keeps the reason', async (reason) => {
      const { fakes, useCase } = setup(FIRST);
      fakes.votes.answerNext(err(reason));

      await useCase.execute();

      expect(fakes.outbox.snapshot()).toMatchObject([{ status: OUTBOX_STATUS.Rejected, reason }]);
    });

    it('never sends a rejected vote again', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.votes.answerNext(err(CLOSED));
      await useCase.execute();

      const second = await useCase.execute();

      expect(fakes.votes.received).toEqual([FIRST.vote, SECOND.vote]);
      expect(second).toEqual(
        ok({ outcome: SYNC_OUTCOME.Completed, synced: [], rejected: [], remaining: 0 }),
      );
    });

    it('leaves alone a vote that was already rejected before the run', async () => {
      const already = aRejectedVote(aVote({ resolutionId: aResolutionId('r9') }));
      const { fakes, useCase } = setup(already, FIRST);

      await useCase.execute();

      expect(fakes.votes.received).toEqual([FIRST.vote]);
      expect(fakes.outbox.snapshot()).toEqual([already]);
    });

    it('logs it with the reason and the attempts', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.votes.answerNext(err(CLOSED));

      await useCase.execute();

      expect(fakes.monitoring.logs[0]).toEqual({
        level: LOG_LEVEL.Warn,
        event: MONITORING_EVENT.VoteRejected,
        attributes: {
          [LOG_ATTRIBUTE.ResolutionId]: aResolutionId('r1'),
          [LOG_ATTRIBUTE.ErrorCode]: VOTING_ERROR_CODE.ResolutionClosed,
          [LOG_ATTRIBUTE.Attempts]: 0,
        },
      });
    });

    it('stops, and reports nothing as rejected, when the outbox cannot record the rejection', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.votes.answerNext(err(CLOSED));
      fakes.outbox.rejectFailure = storageWriteFailed();

      const result = await useCase.execute();

      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Interrupted,
          synced: [],
          rejected: [],
          remaining: 2,
          interruptedBy: storageWriteFailed(),
        }),
      );
      expect(fakes.votes.received).toEqual([FIRST.vote]);
    });
  });

  describe('the monitoring of a run that contains a rejection', () => {
    it('logs the counters of the run, and the code that stopped it', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
      fakes.votes.answerNext(ok(undefined));
      fakes.votes.answerNext(err(CLOSED));
      fakes.votes.answerNext(err(networkUnavailable()));

      await useCase.execute();

      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Warn,
          event: MONITORING_EVENT.VoteRejected,
          attributes: {
            [LOG_ATTRIBUTE.ResolutionId]: aResolutionId('r2'),
            [LOG_ATTRIBUTE.ErrorCode]: VOTING_ERROR_CODE.ResolutionClosed,
            [LOG_ATTRIBUTE.Attempts]: 0,
          },
        },
        {
          level: LOG_LEVEL.Warn,
          event: MONITORING_EVENT.VoteSyncInterrupted,
          attributes: {
            [LOG_ATTRIBUTE.Synced]: 1,
            [LOG_ATTRIBUTE.Rejected]: 1,
            [LOG_ATTRIBUTE.Remaining]: 1,
            [LOG_ATTRIBUTE.ErrorCode]: networkUnavailable().code,
          },
        },
      ]);
    });

    it('logs the counters of a run that went through, rejection included', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
      fakes.votes.answerNext(err(CLOSED));

      await useCase.execute();

      expect(fakes.monitoring.logs.at(-1)).toEqual({
        level: LOG_LEVEL.Info,
        event: MONITORING_EVENT.VoteSyncCompleted,
        attributes: {
          [LOG_ATTRIBUTE.Synced]: 2,
          [LOG_ATTRIBUTE.Rejected]: 1,
          [LOG_ATTRIBUTE.Remaining]: 0,
        },
      });
    });

    it('captures a vote it gave up on with the id of the resolution and the attempts', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      fakes.votes.answerNext(err(unexpected('HTTP 500')));

      await new SyncPendingVotes({ ...fakes, maxAttempts: 1 }).execute();

      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.VoteSubmitFailed,
          error: unexpected('HTTP 500'),
          attributes: { [LOG_ATTRIBUTE.ResolutionId]: aResolutionId('r1') },
        },
      ]);
      expect(fakes.monitoring.logs[0]).toEqual({
        level: LOG_LEVEL.Warn,
        event: MONITORING_EVENT.VoteRejected,
        attributes: {
          [LOG_ATTRIBUTE.ResolutionId]: aResolutionId('r1'),
          [LOG_ATTRIBUTE.ErrorCode]: voteUndeliverable(1).code,
          [LOG_ATTRIBUTE.Attempts]: 1,
        },
      });
    });

    it('captures a failure to count an attempt with the id of the resolution', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.votes.answerNext(err(unexpected()));
      fakes.outbox.markAttemptFailure = storageWriteFailed();

      await useCase.execute();

      expect(fakes.monitoring.errors[1]).toEqual({
        event: MONITORING_EVENT.VoteAttemptNotRecorded,
        error: storageWriteFailed(),
        attributes: { [LOG_ATTRIBUTE.ResolutionId]: aResolutionId('r1') },
      });
    });

    it('captures the outbox that cannot be read again with the dedicated event', async () => {
      class FlakyOutbox extends FakeVoteOutbox {
        private reads = 0;
        override list(voterId: Parameters<FakeVoteOutbox['list']>[0]) {
          this.reads += 1;
          return this.reads === 1
            ? super.list(voterId)
            : Promise.resolve(err(storageReadFailed('x')));
        }
      }
      const fakes = createFakes();
      const outbox = new FlakyOutbox();
      outbox.seed(FIRST);

      await new SyncPendingVotes({ ...fakes, outbox }).execute();

      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.OutboxReadFailed,
          error: storageReadFailed('x'),
          attributes: undefined,
        },
      ]);
    });
  });

  describe('when the network is unavailable', () => {
    it('stops at once and keeps every pending vote, without counting an attempt', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
      fakes.network.goOffline();

      const result = await useCase.execute();

      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Interrupted,
          synced: [],
          rejected: [],
          remaining: 3,
          interruptedBy: networkUnavailable(),
        }),
      );
      expect(fakes.votes.received).toEqual([FIRST.vote]);
      expect(fakes.outbox.snapshot()).toEqual([FIRST, SECOND, THIRD]);
    });

    it('never makes a vote undeliverable, however many times the user is offline', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.network.goOffline();
      for (let run = 0; run < 20; run += 1) await useCase.execute();

      expect(fakes.outbox.snapshot()).toEqual([FIRST]);
    });

    it('keeps what was settled before the network dropped, and what comes after', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
      fakes.votes.answerNext(ok(undefined));
      fakes.votes.answerNext(err(networkUnavailable()));

      const result = await useCase.execute();

      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Interrupted,
          synced: ids(FIRST),
          rejected: [],
          remaining: 2,
          interruptedBy: networkUnavailable(),
        }),
      );
      expect(fakes.votes.received).toEqual([FIRST.vote, SECOND.vote]);
      expect(fakes.outbox.snapshot()).toEqual([SECOND, THIRD]);
    });

    it('goes on from where it stopped on the next run', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.network.goOffline();
      await useCase.execute();
      fakes.network.goOnline();

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({
        outcome: SYNC_OUTCOME.Completed,
        synced: ids(FIRST, SECOND),
      });
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('logs that the run was interrupted, with the cause', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.network.goOffline();

      await useCase.execute();

      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Warn,
          event: MONITORING_EVENT.VoteSyncInterrupted,
          attributes: {
            [LOG_ATTRIBUTE.Synced]: 0,
            [LOG_ATTRIBUTE.Rejected]: 0,
            [LOG_ATTRIBUTE.Remaining]: 2,
            [LOG_ATTRIBUTE.ErrorCode]: networkUnavailable().code,
          },
        },
      ]);
    });
  });

  describe('when the server refuses the user', () => {
    it('stops, keeps every vote pending and says why, without counting an attempt', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.votes.answerNext(err(unauthorized()));

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({
        outcome: SYNC_OUTCOME.Interrupted,
        remaining: 2,
        interruptedBy: unauthorized(),
      });
      expect(fakes.votes.received).toEqual([FIRST.vote]);
      expect(fakes.outbox.snapshot()).toEqual([FIRST, SECOND]);
    });

    it('ends the session on the device and keeps the votes for the next time their voter signs in', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.votes.answerNext(err(unauthorized()));

      await useCase.execute();

      expect(fakes.auth.signOutCalls).toBe(1);
      expect(fakes.auth.session).toBeUndefined();
      expect(fakes.appLock.isLocked()).toBe(true);
      expect(fakes.outbox.snapshot()).toEqual([FIRST, SECOND]);
    });

    it('does not sign out somebody else who signed in meanwhile: that session was not refused', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.votes.onReceive = () => {
        fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
      };
      fakes.votes.answerNext(err(unauthorized()));

      await useCase.execute();

      expect(fakes.auth.signOutCalls).toBe(0);
      expect(fakes.auth.session?.user.id).toBe('user-2');
    });

    it('captures a session that cannot be forgotten, and still reports the interruption', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.auth.signOutFailure = storageWriteFailed();
      fakes.votes.answerNext(err(unauthorized()));

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({ interruptedBy: unauthorized() });
      expect(fakes.monitoring.capturedEvents()).toContain(MONITORING_EVENT.SignOutFailed);
    });
  });

  describe('when the server fails unexpectedly on one vote', () => {
    it('counts an attempt, captures the failure and carries on with the next vote', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
      fakes.votes.answerNext(err(unexpected('HTTP 500')));

      const result = await useCase.execute();

      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Completed,
          synced: ids(SECOND, THIRD),
          rejected: [],
          remaining: 1,
        }),
      );
      expect(fakes.votes.received).toEqual([FIRST.vote, SECOND.vote, THIRD.vote]);
      expect(fakes.outbox.snapshot()).toEqual([{ ...FIRST, attempts: 1 }]);
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.VoteSubmitFailed,
          error: unexpected('HTTP 500'),
          attributes: { [LOG_ATTRIBUTE.ResolutionId]: aResolutionId('r1') },
        },
      ]);
    });

    it('keeps the vote and tries it again on the next run, where the attempts add up', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.votes.answerNext(err(unexpected()));
      fakes.votes.answerNext(err(unexpected()));
      await useCase.execute();
      await useCase.execute();

      expect(states(fakes)).toEqual([['r1', OUTBOX_STATUS.Pending, 2]]);

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({ synced: ids(FIRST) });
    });

    it('gives the vote up after the maximum number of attempts, as undeliverable, for the user to see', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      const useCase = new SyncPendingVotes({ ...fakes, maxAttempts: 3 });
      for (let run = 0; run < 3; run += 1) fakes.votes.answerNext(err(unexpected()));

      await useCase.execute();
      await useCase.execute();
      expect(states(fakes)).toEqual([['r1', OUTBOX_STATUS.Pending, 2]]);
      fakes.clock.advance(5000);
      const result = await useCase.execute();

      const rejected = {
        status: OUTBOX_STATUS.Rejected,
        vote: FIRST.vote,
        enqueuedAt: FIRST.enqueuedAt,
        attempts: 3,
        reason: voteUndeliverable(3),
        rejectedAt: at(5000),
      };
      expect(fakes.outbox.snapshot()).toEqual([rejected]);
      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Completed,
          synced: [],
          rejected: [{ resolutionId: FIRST.vote.resolutionId, reason: voteUndeliverable(3) }],
          remaining: 0,
        }),
      );
      expect(fakes.votes.received).toHaveLength(3);
    });

    it('does not let one bad vote block the others for ever', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST, SECOND);
      const useCase = new SyncPendingVotes({ ...fakes, maxAttempts: 2 });
      const failFirst = (vote: { resolutionId: unknown }) => {
        if (vote.resolutionId === FIRST.vote.resolutionId)
          fakes.votes.answerNext(err(unexpected()));
      };
      fakes.votes.onReceive = failFirst;

      await useCase.execute();
      fakes.outbox.seed(THIRD);
      await useCase.execute();

      expect(fakes.votes.recordedVotes()).toEqual([SECOND.vote, THIRD.vote]);
      expect(states(fakes)).toEqual([['r1', OUTBOX_STATUS.Rejected, 2]]);
    });

    it('still counts the attempt for its decision, and captures it, when the outbox cannot record it', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      const useCase = new SyncPendingVotes({ ...fakes, maxAttempts: 1 });
      fakes.votes.answerNext(err(unexpected()));
      fakes.outbox.markAttemptFailure = storageWriteFailed();

      await useCase.execute();

      expect(fakes.monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.VoteSubmitFailed,
        MONITORING_EVENT.VoteAttemptNotRecorded,
      ]);
      expect(fakes.outbox.snapshot()).toMatchObject([
        { status: OUTBOX_STATUS.Rejected, reason: voteUndeliverable(1) },
      ]);
    });
  });

  describe('when the outbox cannot be updated', () => {
    it('stops and does not report as settled a vote that is still pending', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.outbox.removeFailure = storageWriteFailed();

      const result = await useCase.execute();

      expect(result).toEqual(
        ok({
          outcome: SYNC_OUTCOME.Interrupted,
          synced: [],
          rejected: [],
          remaining: 2,
          interruptedBy: storageWriteFailed(),
        }),
      );
      expect(fakes.votes.received).toEqual([FIRST.vote]);
    });

    it('sends the vote again on the next run, and the server still holds it once', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.outbox.removeFailure = storageWriteFailed();
      await useCase.execute();
      fakes.outbox.removeFailure = undefined;

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({
        outcome: SYNC_OUTCOME.Completed,
        synced: ids(FIRST),
      });
      expect(fakes.votes.received).toEqual([FIRST.vote, FIRST.vote]);
      expect(fakes.votes.recordedVotes()).toEqual([FIRST.vote]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('returns the storage error when the outbox cannot be read', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.outbox.listFailure = storageReadFailed();

      expect(await useCase.execute()).toEqual(err(storageReadFailed()));
      expect(fakes.votes.received).toEqual([]);
    });
  });

  describe('the number of votes still pending', () => {
    it('is counted again from the outbox after the run, which may have changed meanwhile', async () => {
      const { fakes, useCase } = setup(FIRST);
      const castMeanwhile = aPendingVote(aVote({ resolutionId: aResolutionId('r7') }));
      fakes.votes.onReceive = () => fakes.outbox.seed(castMeanwhile);

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({ synced: ids(FIRST), remaining: 1 });
    });

    it('falls back on what the run knows, and captures the failure, when the outbox cannot be read again', async () => {
      class FlakyOutbox extends FakeVoteOutbox {
        private reads = 0;
        override list(voterId: Parameters<FakeVoteOutbox['list']>[0]) {
          this.reads += 1;
          return this.reads === 1 ? super.list(voterId) : Promise.resolve(err(storageReadFailed()));
        }
      }
      const fakes = createFakes();
      const outbox = new FlakyOutbox();
      outbox.seed(FIRST, SECOND);
      fakes.votes.answerNext(ok(undefined));
      fakes.votes.answerNext(err(networkUnavailable()));

      const result = await new SyncPendingVotes({ ...fakes, outbox }).execute();

      expect(result.ok && result.value).toMatchObject({ synced: ids(FIRST), remaining: 1 });
      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.OutboxReadFailed]);
    });
  });

  describe('whose votes it sends', () => {
    it('only those of the signed-in user, and leaves the others untouched', async () => {
      const others = aPendingVote(
        aVote({ voterId: aUserId('user-2'), resolutionId: aResolutionId('r9') }),
      );
      const { fakes, useCase } = setup(FIRST, others, SECOND);

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({
        outcome: SYNC_OUTCOME.Completed,
        synced: ids(FIRST, SECOND),
        remaining: 0,
      });
      expect(fakes.votes.received).toEqual([FIRST.vote, SECOND.vote]);
      expect(fakes.outbox.snapshot()).toEqual([others]);
    });

    it('does not count the votes of others as remaining', async () => {
      const others = aPendingVote(aVote({ voterId: aUserId('user-2') }));
      const { fakes, useCase } = setup(FIRST, others);
      fakes.network.goOffline();

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({ remaining: 1 });
    });
  });

  describe('the session', () => {
    it('is required: nothing is sent without it', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.auth.session = undefined;

      expect(await useCase.execute()).toEqual(err(notAuthenticated()));
      expect(fakes.votes.received).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([FIRST]);
    });

    it('must not have expired: the votes wait for the next sign-in', async () => {
      const { fakes, useCase } = setup(FIRST);
      fakes.auth.session = aSession({ expiresAt: NOW });

      expect(await useCase.execute()).toEqual(err(sessionExpired()));
      expect(fakes.outbox.snapshot()).toEqual([FIRST]);
    });

    describe('the lock of the app', () => {
      it('does not run while the app is locked: nothing is sent, nothing changes in the outbox', async () => {
        const { fakes, useCase } = setup(FIRST, SECOND);
        fakes.appLock.lock();

        expect(await useCase.execute()).toEqual(err(appLocked()));
        expect(fakes.votes.received).toEqual([]);
        expect(fakes.outbox.snapshot()).toEqual([FIRST, SECOND]);
      });

      it('runs again once the app is unlocked, and sends what waited', async () => {
        const { fakes, useCase } = setup(FIRST);
        fakes.appLock.lock();
        await useCase.execute();
        fakes.appLock.unlock();

        const result = await useCase.execute();

        expect(result.ok && result.value).toMatchObject({ synced: ids(FIRST) });
      });

      it('stops at the next vote when the app is locked in the middle of a run', async () => {
        const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
        fakes.votes.answerNext(ok(undefined));
        fakes.votes.onReceive = () => fakes.appLock.lock();

        const result = await useCase.execute();

        expect(result.ok && result.value).toMatchObject({
          outcome: SYNC_OUTCOME.Interrupted,
          interruptedBy: appLocked(),
          synced: ids(FIRST),
          remaining: 2,
        });
        expect(fakes.votes.received).toEqual([FIRST.vote]);
      });
    });

    it('reports resolutions and reasons only: the choice of a vote is never in the report', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);
      fakes.votes.answerNext(ok(undefined));
      fakes.votes.answerNext(err(CLOSED));

      const result = await useCase.execute();

      const text = JSON.stringify(result);
      expect(text).not.toContain('choice');
      for (const choice of Object.values(VOTE_CHOICE)) expect(text).not.toContain(`"${choice}"`);
      expect(result.ok && result.value).toMatchObject({
        synced: ids(FIRST),
        rejected: [{ resolutionId: SECOND.vote.resolutionId, reason: CLOSED }],
      });
    });

    describe('is checked again before each vote', () => {
      it('stops the run when another user signs in meanwhile: the votes of A are not sent under B', async () => {
        const { fakes, useCase } = setup(FIRST, SECOND, THIRD);
        fakes.votes.answerNext(ok(undefined));
        fakes.votes.onReceive = () => {
          fakes.auth.session = aSession({
            user: aUser({ id: aUserId('user-B'), email: anEmail('b@example.com') }),
          });
        };

        const result = await useCase.execute();

        expect(result).toEqual(
          ok({
            outcome: SYNC_OUTCOME.Interrupted,
            synced: ids(FIRST),
            rejected: [],
            remaining: 2,
            interruptedBy: sessionChanged(),
          }),
        );
        expect(fakes.votes.received).toEqual([FIRST.vote]);
        expect(fakes.outbox.snapshot()).toEqual([SECOND, THIRD]);
      });

      it('stops the run when the user signs out meanwhile', async () => {
        const { fakes, useCase } = setup(FIRST, SECOND);
        fakes.votes.answerNext(ok(undefined));
        fakes.votes.onReceive = () => {
          fakes.auth.session = undefined;
        };

        const result = await useCase.execute();

        expect(result.ok && result.value).toMatchObject({
          outcome: SYNC_OUTCOME.Interrupted,
          interruptedBy: notAuthenticated(),
          remaining: 1,
        });
        expect(fakes.votes.received).toEqual([FIRST.vote]);
      });

      it('stops the run when the session expires meanwhile', async () => {
        const { fakes, useCase } = setup(FIRST, SECOND);
        fakes.votes.answerNext(ok(undefined));
        fakes.votes.onReceive = () => fakes.clock.set(at(3_600_000));

        const result = await useCase.execute();

        expect(result.ok && result.value).toMatchObject({
          outcome: SYNC_OUTCOME.Interrupted,
          interruptedBy: sessionExpired(),
        });
        expect(fakes.votes.received).toEqual([FIRST.vote]);
      });

      it('also checks before the first vote: the user may change while the outbox is being read', async () => {
        const fakes = createFakes();
        class SwitchingOutbox extends FakeVoteOutbox {
          override async list(voterId: Parameters<FakeVoteOutbox['list']>[0]) {
            const listed = await super.list(voterId);
            fakes.auth.session = aSession({
              user: aUser({ id: aUserId('user-B'), email: anEmail('b@example.com') }),
            });
            return listed;
          }
        }
        const outbox = new SwitchingOutbox();
        outbox.seed(FIRST);

        const result = await new SyncPendingVotes({ ...fakes, outbox }).execute();

        expect(result.ok && result.value).toMatchObject({
          outcome: SYNC_OUTCOME.Interrupted,
          interruptedBy: sessionChanged(),
          remaining: 1,
        });
        expect(fakes.votes.received).toEqual([]);
      });

      it('keeps going while it is the same user', async () => {
        const { fakes, useCase } = setup(FIRST, SECOND, THIRD);

        await useCase.execute();

        expect(fakes.votes.received).toHaveLength(3);
      });
    });
  });

  describe('overlapping calls', () => {
    it('makes a call a no-op while a run is in progress, and sends each vote once', async () => {
      const { fakes, useCase } = setup(FIRST, SECOND);

      const [first, second] = await Promise.all([useCase.execute(), useCase.execute()]);

      expect(first.ok && first.value.outcome).toBe(SYNC_OUTCOME.Completed);
      expect(second).toEqual(ok({ outcome: SYNC_OUTCOME.AlreadyRunning }));
      expect(fakes.votes.received).toEqual([FIRST.vote, SECOND.vote]);
    });

    it('accepts a new run once the previous one is over', async () => {
      const { fakes, useCase } = setup(FIRST);
      await useCase.execute();
      fakes.outbox.seed(SECOND);

      const result = await useCase.execute();

      expect(result.ok && result.value).toMatchObject({
        outcome: SYNC_OUTCOME.Completed,
        synced: ids(SECOND),
      });
    });

    it('releases the guard even when a port breaks its contract and rejects', async () => {
      class RejectingOutbox extends FakeVoteOutbox {
        override list(): ReturnType<FakeVoteOutbox['list']> {
          return Promise.reject(new Error('outbox exploded'));
        }
      }
      const fakes = createFakes();
      const useCase = new SyncPendingVotes({ ...fakes, outbox: new RejectingOutbox() });

      await expect(useCase.execute()).rejects.toThrow('outbox exploded');

      const healthy = new SyncPendingVotes(fakes);
      expect(await healthy.execute()).toEqual(
        ok({ outcome: SYNC_OUTCOME.Completed, synced: [], rejected: [], remaining: 0 }),
      );
      await expect(useCase.execute()).rejects.toThrow('outbox exploded');
    });

    it('does not share its guard between instances: both send the vote, and the idempotency key keeps it recorded once', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      const a = new SyncPendingVotes(fakes);
      const b = new SyncPendingVotes(fakes);

      const [first, second] = await Promise.all([a.execute(), b.execute()]);

      expect(first.ok && first.value.outcome).toBe(SYNC_OUTCOME.Completed);
      expect(second.ok && second.value.outcome).toBe(SYNC_OUTCOME.Completed);
      expect(fakes.votes.received).toEqual([FIRST.vote, FIRST.vote]);
      expect(fakes.votes.recordedVotes()).toEqual([FIRST.vote]);
    });
  });
});
