import { createMeeting, findResolution } from '@domain/entities/Meeting';
import { idempotencyKeyOf } from '@domain/entities/Vote';
import { OUTBOX_STATUS } from '@domain/entities/OutboxVote';
import { PARTICIPANT_ROLE } from '@domain/entities/Participant';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import {
  appLocked,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from '@domain/errors/AuthenticationError';
import {
  biometricCancelled,
  biometricLockedOut,
  biometricUnavailable,
} from '@domain/errors/BiometricError';
import {
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from '@domain/errors/RepositoryError';
import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import type { VotingError } from '@domain/errors/VotingError';
import { err, ok } from '@domain/shared/Result';
import {
  NOW,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aMeetingWithAgenda,
  aParticipant,
  aPendingVote,
  aResolution,
  aRejectedVote,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
  anAgendaItem,
  anAgendaItemId,
  at,
  unwrap,
} from '@domain/testing/builders';
import {
  voteInProgress,
  votePreviouslyRejected,
  voteUndeliverable,
} from '@domain/errors/VoteDeliveryError';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { BIOMETRIC_REASON } from '../../ports/BiometricGate';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { createFakes } from '../../testing/createFakes';
import { FakeVoteOutbox } from '../../testing/FakeVoteOutbox';

import { CAST_VOTE_STATUS, CastVote } from './CastVote';

const INPUT = {
  meetingId: aMeetingId(),
  resolutionId: aResolutionId(),
  choice: VOTE_CHOICE.For,
} as const;

/** user-1 is signed in; the meeting is on the server; its resolution is open. */
function setup(meeting = aMeeting()) {
  const fakes = createFakes();
  fakes.meetings.addMeeting(meeting);
  return { fakes, useCase: new CastVote(fakes) };
}

/** A meeting whose only resolution is the given one. */
function meetingWith(resolution: ReturnType<typeof aResolution>) {
  return unwrap(
    createMeeting({
      ...aMeeting(),
      summary: aMeetingSummary(),
      agenda: [anAgendaItem({ resolution })],
    }),
  );
}

describe('CastVote', () => {
  describe('with a network', () => {
    it('submits the vote of the signed-in user, built with the clock, and reports it submitted', async () => {
      const { fakes, useCase } = setup();
      fakes.clock.advance(5000);

      const result = await useCase.execute(INPUT);

      const expectedVote = aVote({ castAt: at(5000), choice: VOTE_CHOICE.For });
      expect(result).toEqual(ok({ status: CAST_VOTE_STATUS.Submitted, vote: expectedVote }));
      expect(fakes.votes.recordedVotes()).toEqual([expectedVote]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it.each(Object.values(VOTE_CHOICE))('carries the choice %s', async (choice) => {
      const { fakes, useCase } = setup();

      await useCase.execute({ ...INPUT, choice });

      expect(fakes.votes.recordedVotes().map((vote) => vote.choice)).toEqual([choice]);
    });

    it('asks for the biometric confirmation of the vote', async () => {
      const { fakes, useCase } = setup();

      await useCase.execute(INPUT);

      expect(fakes.biometricGate.prompts).toEqual([BIOMETRIC_REASON.ConfirmVote]);
    });

    it('logs the vote with identifiers only, never the choice', async () => {
      const { fakes, useCase } = setup();

      await useCase.execute({ ...INPUT, choice: VOTE_CHOICE.Against });

      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Info,
          event: MONITORING_EVENT.VoteSubmitted,
          attributes: {
            [LOG_ATTRIBUTE.MeetingId]: aMeetingId(),
            [LOG_ATTRIBUTE.ResolutionId]: aResolutionId(),
          },
        },
      ]);
      expect(JSON.stringify(fakes.monitoring.logs)).not.toContain(VOTE_CHOICE.Against);
    });

    it('lets the chair vote', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ user: { ...aSession().user, id: aUserId('user-2') } });

      const result = await useCase.execute(INPUT);

      expect(result.ok && result.value.vote.voterId).toBe(aUserId('user-2'));
    });
  });

  describe('without a network', () => {
    it('queues the vote in the outbox and reports it queued', async () => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.network.goOffline();
      fakes.clock.advance(2000);

      const result = await useCase.execute(INPUT);

      const expectedVote = aVote({ castAt: at(2000) });
      expect(result).toEqual(ok({ status: CAST_VOTE_STATUS.Queued, vote: expectedVote }));
      expect(fakes.outbox.snapshot()).toEqual([
        { status: OUTBOX_STATUS.Pending, vote: expectedVote, enqueuedAt: at(2000), attempts: 0 },
      ]);
      expect(fakes.votes.recordedVotes()).toEqual([]);
      expect(fakes.monitoring.loggedEvents()).toEqual([
        MONITORING_EVENT.ServedFromCache,
        MONITORING_EVENT.VoteQueued,
      ]);
    });

    it('queues a vote cast right after the network dropped, from a meeting that is loaded fresh', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(networkUnavailable()));

      const result = await useCase.execute(INPUT);

      expect(result.ok && result.value.status).toBe(CAST_VOTE_STATUS.Queued);
      expect(fakes.outbox.snapshot()).toHaveLength(1);
    });

    it('cannot vote on a meeting that was never loaded: nobody is asked for a confirmation', async () => {
      const { fakes, useCase } = setup();
      fakes.network.goOffline();

      expect(await useCase.execute(INPUT)).toEqual(err(networkUnavailable()));
      expect(fakes.biometricGate.prompts).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('refuses a second vote on the same resolution while the first one is queued', async () => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.network.goOffline();
      await useCase.execute(INPUT);
      fakes.biometricGate.prompts.length = 0;

      const second = await useCase.execute({ ...INPUT, choice: VOTE_CHOICE.Against });

      expect(second).toEqual(
        err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Queued }),
      );
      expect(fakes.biometricGate.prompts).toEqual([]);
      expect(fakes.outbox.snapshot()).toHaveLength(1);
    });

    it('decides from the cached copy of the meeting, flagged stale', async () => {
      const closed = meetingWith(aResolution({ status: RESOLUTION_STATUS.Closed }));
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), closed, NOW);
      fakes.network.goOffline();

      expect(await useCase.execute(INPUT)).toEqual(
        err({ code: VOTING_ERROR_CODE.ResolutionClosed }),
      );
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('returns the storage error, and keeps no vote, when the outbox cannot be written', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(networkUnavailable()));
      fakes.outbox.enqueueFailure = storageWriteFailed();

      expect(await useCase.execute(INPUT)).toEqual(err(storageWriteFailed()));
      expect(fakes.outbox.snapshot()).toEqual([]);
    });
  });

  describe('the session', () => {
    it('is required', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = undefined;

      expect(await useCase.execute(INPUT)).toEqual(err(notAuthenticated()));
      expect(fakes.meetings.getCalls).toEqual([]);
      expect(fakes.biometricGate.prompts).toEqual([]);
    });

    it('must not have expired', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ expiresAt: NOW });

      expect(await useCase.execute(INPUT)).toEqual(err(sessionExpired()));
    });
  });

  describe('the eligibility', () => {
    it('returns notFound for an unknown meeting', async () => {
      const { fakes, useCase } = setup();

      expect(await useCase.execute({ ...INPUT, meetingId: aMeetingId('missing') })).toEqual(
        err(notFound()),
      );
      expect(fakes.biometricGate.prompts).toEqual([]);
    });

    it('refuses an unknown resolution', async () => {
      const { useCase } = setup();

      expect(await useCase.execute({ ...INPUT, resolutionId: aResolutionId('missing') })).toEqual(
        err({ code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId('missing') }),
      );
    });

    it('refuses somebody who is not a participant of the meeting', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ user: { ...aSession().user, id: aUserId('stranger') } });

      expect(await useCase.execute(INPUT)).toEqual(
        err({ code: VOTING_ERROR_CODE.NotAParticipant }),
      );
    });

    it.each([PARTICIPANT_ROLE.Secretary, PARTICIPANT_ROLE.Guest])(
      'refuses a %s, who has no voting rights',
      async (role) => {
        const meeting = createMeeting({
          ...aMeeting(),
          summary: aMeetingSummary(),
          participants: [aParticipant({ role })],
        });
        const { fakes, useCase } = setup(unwrap(meeting));

        expect(await useCase.execute(INPUT)).toEqual(
          err({ code: VOTING_ERROR_CODE.NoVotingRights }),
        );
        expect(fakes.votes.received).toEqual([]);
      },
    );

    it('refuses a closed resolution', async () => {
      const { useCase } = setup(meetingWith(aResolution({ status: RESOLUTION_STATUS.Closed })));

      expect(await useCase.execute(INPUT)).toEqual(
        err({ code: VOTING_ERROR_CODE.ResolutionClosed }),
      );
    });

    it('accepts a vote while the voting window is open, and refuses it once the clock reaches the end', async () => {
      const { fakes, useCase } = setup(meetingWith(aResolution({ closesAt: at(60_000) })));
      fakes.clock.advance(59_999);

      expect(await useCase.execute(INPUT)).toEqual(
        ok({ status: CAST_VOTE_STATUS.Submitted, vote: aVote({ castAt: at(59_999) }) }),
      );

      const late = setup(meetingWith(aResolution({ closesAt: at(60_000) })));
      late.fakes.clock.advance(60_000);
      expect(await late.useCase.execute(INPUT)).toEqual(
        err({ code: VOTING_ERROR_CODE.VotingWindowOver }),
      );
      expect(late.fakes.votes.received).toEqual([]);
    });

    it('refuses a voter whose vote the server already records', async () => {
      const { fakes, useCase } = setup(
        meetingWith(aResolution({ recordedVote: VOTE_CHOICE.Abstain })),
      );

      expect(await useCase.execute(INPUT)).toEqual(
        err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded }),
      );
      expect(fakes.biometricGate.prompts).toEqual([]);
    });

    it('refuses a voter whose vote already waits in the outbox, and ignores the votes of others', async () => {
      const { fakes, useCase } = setup();
      fakes.outbox.seed(aPendingVote(aVote({ voterId: aUserId('user-2') })));

      expect(await useCase.execute(INPUT)).toEqual(
        ok({ status: CAST_VOTE_STATUS.Submitted, vote: aVote() }),
      );

      fakes.outbox.seed(aPendingVote(aVote()));
      expect(await useCase.execute(INPUT)).toEqual(
        err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Queued }),
      );
    });

    it('returns the storage error when the outbox cannot be read', async () => {
      const { fakes, useCase } = setup();
      fakes.outbox.findFailure = storageReadFailed();

      expect(await useCase.execute(INPUT)).toEqual(err(storageReadFailed()));
      expect(fakes.biometricGate.prompts).toEqual([]);
    });
  });

  describe('the session after the biometric prompt', () => {
    it('refuses the vote when another user signed in while the prompt was shown, and sends or queues nothing', async () => {
      const { fakes, useCase } = setup();
      fakes.biometricGate.onPrompt = () => {
        fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
      };

      expect(await useCase.execute(INPUT)).toEqual(err(sessionChanged()));
      expect(fakes.votes.received).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('refuses the vote when the app was locked while the prompt was shown', async () => {
      const { fakes, useCase } = setup();
      fakes.biometricGate.onPrompt = () => fakes.appLock.lock();

      expect(await useCase.execute(INPUT)).toEqual(err(appLocked()));
      expect(fakes.votes.received).toEqual([]);
    });

    it('refuses the vote when the session ended while the prompt was shown', async () => {
      const { fakes, useCase } = setup();
      fakes.biometricGate.onPrompt = () => {
        fakes.auth.session = undefined;
      };

      expect(await useCase.execute(INPUT)).toEqual(err(notAuthenticated()));
      expect(fakes.votes.received).toEqual([]);
    });

    it('goes on when the same user is still signed in', async () => {
      const { fakes, useCase } = setup();
      fakes.biometricGate.onPrompt = () => {
        fakes.auth.session = aSession();
      };

      const result = await useCase.execute(INPUT);

      expect(result.ok && result.value.status).toBe(CAST_VOTE_STATUS.Submitted);
    });
  });

  describe('the biometric confirmation', () => {
    it.each([biometricCancelled(), biometricLockedOut()])(
      'stops the vote when the user ends with %p: nothing is sent or queued',
      async (error) => {
        const { fakes, useCase } = setup();
        fakes.biometricGate.authentication = err(error);

        expect(await useCase.execute(INPUT)).toEqual(err(error));
        expect(fakes.votes.received).toEqual([]);
        expect(fakes.outbox.snapshot()).toEqual([]);
      },
    );

    it('reports a device without biometrics, without a prompt', async () => {
      const { fakes, useCase } = setup();
      fakes.biometricGate.availability = err(biometricUnavailable());

      expect(await useCase.execute(INPUT)).toEqual(err(biometricUnavailable()));
      expect(fakes.biometricGate.prompts).toEqual([]);
      expect(fakes.votes.received).toEqual([]);
    });
  });

  describe('a refusal of the server', () => {
    it.each<VotingError>([
      { code: VOTING_ERROR_CODE.ResolutionClosed },
      { code: VOTING_ERROR_CODE.NotAParticipant },
      { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
    ])('returns the business rejection %p, queues nothing and logs it', async (rejection) => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(rejection));

      expect(await useCase.execute(INPUT)).toEqual(err(rejection));
      expect(fakes.outbox.snapshot()).toEqual([]);
      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Warn,
          event: MONITORING_EVENT.VoteRejected,
          attributes: {
            [LOG_ATTRIBUTE.MeetingId]: aMeetingId(),
            [LOG_ATTRIBUTE.ResolutionId]: aResolutionId(),
            [LOG_ATTRIBUTE.ErrorCode]: rejection.code,
          },
        },
      ]);
    });

    it('returns unauthorized, and queues nothing: the user must sign in again', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(unauthorized()));

      expect(await useCase.execute(INPUT)).toEqual(err(unauthorized()));
      expect(fakes.outbox.snapshot()).toEqual([]);
      expect(fakes.monitoring.logs).toEqual([]);
    });

    it('ends the session on the device: the user is signed out, the app locked, the caches emptied', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(unauthorized()));

      await useCase.execute(INPUT);

      expect(fakes.auth.signOutCalls).toBe(1);
      expect(fakes.auth.session).toBeUndefined();
      expect(fakes.appLock.isLocked()).toBe(true);
      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('does not sign out somebody else who signed in meanwhile: that session was not refused', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.onReceive = () => {
        fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
      };
      fakes.votes.answerNext(err(unauthorized()));

      expect(await useCase.execute(INPUT)).toEqual(err(unauthorized()));

      expect(fakes.auth.signOutCalls).toBe(0);
      expect(fakes.auth.session?.user.id).toBe('user-2');
      expect(fakes.appLock.isLocked()).toBe(false);
    });

    it('captures a session that cannot be forgotten, and still returns unauthorized', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.signOutFailure = storageWriteFailed();
      fakes.votes.answerNext(err(unauthorized()));

      expect(await useCase.execute(INPUT)).toEqual(err(unauthorized()));
      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.SignOutFailed]);
    });
  });

  describe('an entry of the outbox that cannot be read holds the key of the vote', () => {
    it('does not overwrite it, queues nothing, and says the vote could not be stored', async () => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.network.goOffline();
      fakes.outbox.seedUnreadable(aUserId(), idempotencyKeyOf(INPUT.resolutionId, aUserId()));

      const result = await useCase.execute(INPUT);

      expect(result).toEqual(err(storageWriteFailed('unreadable entry holds the key')));
      expect(fakes.outbox.snapshot()).toEqual([]);
      expect(fakes.outbox.unreadableSnapshot()).toHaveLength(1);
      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.VoteEnqueueFailed]);
    });

    it('queues the vote once the entry is discarded', async () => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.network.goOffline();
      fakes.outbox.seedUnreadable(aUserId(), idempotencyKeyOf(INPUT.resolutionId, aUserId()));
      await useCase.execute(INPUT);
      await fakes.outbox.discardUnreadable(aUserId());

      const result = await useCase.execute(INPUT);

      expect(result.ok && result.value.status).toBe(CAST_VOTE_STATUS.Queued);
    });
  });

  describe('an unexpected failure of the server', () => {
    it('queues the vote like a network failure, since the server may have recorded it, and counts an attempt', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(unexpected('HTTP 500')));

      const result = await useCase.execute(INPUT);

      expect(result.ok && result.value.status).toBe(CAST_VOTE_STATUS.Queued);
      expect(fakes.outbox.snapshot()).toEqual([
        { status: OUTBOX_STATUS.Pending, vote: aVote(), enqueuedAt: NOW, attempts: 1 },
      ]);
    });

    it('captures the failure it swallows, and logs the vote as queued', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(unexpected('HTTP 500')));

      await useCase.execute(INPUT);

      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.VoteSubmitFailed,
          error: unexpected('HTTP 500'),
          attributes: {
            [LOG_ATTRIBUTE.MeetingId]: aMeetingId(),
            [LOG_ATTRIBUTE.ResolutionId]: aResolutionId(),
          },
        },
      ]);
      expect(fakes.monitoring.loggedEvents()).toEqual([MONITORING_EVENT.VoteQueued]);
    });

    it('is replayed safely: the server holds the vote once if it had recorded it', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(unexpected('answer lost')));
      await useCase.execute(INPUT);

      const [queued] = fakes.outbox.snapshot();
      if (queued === undefined) throw new Error('the vote should be queued');
      await fakes.votes.submit(queued.vote);
      await fakes.votes.submit(queued.vote);

      expect(fakes.votes.recordedVotes()).toEqual([queued.vote]);
    });
  });

  describe('a failure of the outbox', () => {
    it('is captured with a dedicated event before it is returned, when the vote could not be kept', async () => {
      const { fakes, useCase } = setup();
      fakes.votes.answerNext(err(networkUnavailable()));
      fakes.outbox.enqueueFailure = storageWriteFailed('disk full');

      expect(await useCase.execute(INPUT)).toEqual(err(storageWriteFailed('disk full')));
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.VoteEnqueueFailed,
          error: storageWriteFailed('disk full'),
          attributes: {
            [LOG_ATTRIBUTE.MeetingId]: aMeetingId(),
            [LOG_ATTRIBUTE.ResolutionId]: aResolutionId(),
          },
        },
      ]);
    });
  });

  describe('the cached meeting after a vote the server recorded', () => {
    function cachedChoice(fakes: ReturnType<typeof createFakes>) {
      return fakes.meetingCache
        .readMeeting(aUserId(), aMeetingId())
        .then((cached) =>
          cached.ok && cached.value
            ? findResolution(cached.value.value, aResolutionId())?.recordedVote
            : undefined,
        );
    }

    it('records the vote, so that the copy shows it', async () => {
      const { fakes, useCase } = setup();

      await useCase.execute({ ...INPUT, choice: VOTE_CHOICE.Against });

      expect(await cachedChoice(fakes)).toBe(VOTE_CHOICE.Against);
    });

    it('keeps the date the copy was cached at', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(INPUT);
      fakes.clock.advance(60_000);
      fakes.network.goOffline();

      const cached = await fakes.meetingCache.readMeeting(aUserId(), aMeetingId());
      expect(cached.ok && cached.value?.cachedAt).toBe(NOW);
    });

    it('stops the user from voting again offline: told it was already voted, not "queued"', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(INPUT);
      fakes.network.goOffline();
      fakes.biometricGate.prompts.length = 0;

      const second = await useCase.execute({ ...INPUT, choice: VOTE_CHOICE.Against });

      expect(second).toEqual(
        err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded }),
      );
      expect(fakes.biometricGate.prompts).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('does not fail the vote when the copy cannot be updated, and captures it', async () => {
      const { fakes, useCase } = setup();
      // The meeting is cached when it is loaded; the cache breaks while the vote is sent.
      fakes.votes.onReceive = () => {
        fakes.meetingCache.writeFailure = storageWriteFailed();
      };

      const result = await useCase.execute(INPUT);

      expect(result.ok && result.value.status).toBe(CAST_VOTE_STATUS.Submitted);
      expect(fakes.monitoring.errors).toEqual([
        expect.objectContaining({
          event: MONITORING_EVENT.CacheWriteFailed,
          error: storageWriteFailed(),
        }),
      ]);
    });

    it('does not write it for a vote that was only queued', async () => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.network.goOffline();

      await useCase.execute(INPUT);

      expect(await cachedChoice(fakes)).toBeUndefined();
    });
  });

  describe('two votes on the same resolution at the same time', () => {
    it('fails the second one at once with a precise error, and the first one goes through', async () => {
      const { fakes, useCase } = setup();

      const [first, second] = await Promise.all([
        useCase.execute(INPUT),
        useCase.execute({ ...INPUT, choice: VOTE_CHOICE.Against }),
      ]);

      expect(first.ok && first.value.status).toBe(CAST_VOTE_STATUS.Submitted);
      expect(second).toEqual(err(voteInProgress()));
      expect(fakes.biometricGate.prompts).toHaveLength(1);
      expect(fakes.votes.recordedVotes().map(({ choice }) => choice)).toEqual([VOTE_CHOICE.For]);
    });

    it('lets a vote on another resolution proceed', async () => {
      const { useCase } = setup(
        unwrap(
          createMeeting({
            ...aMeeting(),
            summary: aMeetingSummary(),
            agenda: [
              anAgendaItem(),
              anAgendaItem({
                id: anAgendaItemId('agenda-2'),
                position: 2,
                resolution: aResolution({ id: aResolutionId('resolution-2') }),
              }),
            ],
          }),
        ),
      );

      const [first, second] = await Promise.all([
        useCase.execute(INPUT),
        useCase.execute({ ...INPUT, resolutionId: aResolutionId('resolution-2') }),
      ]);

      expect(first).toEqual(ok({ status: CAST_VOTE_STATUS.Submitted, vote: aVote() }));
      expect(second).toEqual(
        ok({
          status: CAST_VOTE_STATUS.Submitted,
          vote: aVote({ resolutionId: aResolutionId('resolution-2') }),
        }),
      );
    });

    it('accepts a new attempt as soon as the previous one is over, whatever its outcome', async () => {
      const { fakes, useCase } = setup();
      fakes.biometricGate.authentication = err(biometricCancelled());
      expect(await useCase.execute(INPUT)).toEqual(err(biometricCancelled()));

      fakes.biometricGate.authentication = ok(undefined);

      expect(await useCase.execute(INPUT)).toEqual(
        ok({ status: CAST_VOTE_STATUS.Submitted, vote: aVote() }),
      );
    });

    it('is refused by the outbox, not hidden, when two instances queue different choices at once', async () => {
      const first = setup();
      const second = new CastVote(first.fakes);
      await first.fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      first.fakes.network.goOffline();

      const [a, b] = await Promise.all([
        first.useCase.execute(INPUT),
        second.execute({ ...INPUT, choice: VOTE_CHOICE.Against }),
      ]);

      expect(a.ok && a.value.status).toBe(CAST_VOTE_STATUS.Queued);
      expect(b).toEqual(
        err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Queued }),
      );
      expect(first.fakes.outbox.snapshot().map(({ vote }) => vote.choice)).toEqual([
        VOTE_CHOICE.For,
      ]);
    });
  });

  describe('a vote of the user that the outbox holds as rejected', () => {
    it('is not replaced by a new one: the user must acknowledge it first', async () => {
      const { fakes, useCase } = setup();
      const rejected = aRejectedVote(aVote(), voteUndeliverable(5));
      fakes.outbox.seed(rejected);

      expect(await useCase.execute(INPUT)).toEqual(
        err(votePreviouslyRejected(voteUndeliverable(5))),
      );
      expect(fakes.biometricGate.prompts).toEqual([]);
      expect(fakes.votes.received).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([rejected]);
    });

    it('is reported when the outbox refuses the new vote because of it', async () => {
      class BlindOutbox extends FakeVoteOutbox {
        override findByResolution(): ReturnType<FakeVoteOutbox['findByResolution']> {
          return Promise.resolve(ok([]));
        }
      }
      const fakes = createFakes();
      fakes.meetings.addMeeting(aMeeting());
      const outbox = new BlindOutbox();
      outbox.seed(aRejectedVote(aVote(), { code: VOTING_ERROR_CODE.ResolutionClosed }));

      fakes.votes.answerNext(err(networkUnavailable()));

      const result = await new CastVote({ ...fakes, outbox }).execute(INPUT);

      expect(result).toEqual(
        err(votePreviouslyRejected({ code: VOTING_ERROR_CODE.ResolutionClosed })),
      );
    });

    it('is not mixed up with the votes of another user', async () => {
      const { fakes, useCase } = setup();
      const others = aRejectedVote(aVote({ voterId: aUserId('user-2') }));
      fakes.outbox.seed(others);

      expect(await useCase.execute(INPUT)).toEqual(
        ok({ status: CAST_VOTE_STATUS.Submitted, vote: aVote() }),
      );
      expect(fakes.outbox.snapshot()).toEqual([others]);
    });
  });

  describe('the instants of a vote', () => {
    it('keeps the instant of the cast in the vote and takes the instant of the enqueueing from the clock at that moment', async () => {
      const { fakes, useCase } = setup();
      fakes.clock.advance(1000);
      // The biometric prompt is long gone and the request takes its time: the clock moves on.
      fakes.votes.onReceive = () => fakes.clock.advance(7000);
      fakes.votes.answerNext(err(networkUnavailable()));

      await useCase.execute(INPUT);

      expect(fakes.outbox.snapshot()).toEqual([
        {
          status: OUTBOX_STATUS.Pending,
          vote: aVote({ castAt: at(1000) }),
          enqueuedAt: at(8000),
          attempts: 0,
        },
      ]);
    });

    it('stamps the vote after the biometric confirmation, not before', async () => {
      const { fakes, useCase } = setup();
      fakes.biometricGate.authentication = ok(undefined);
      const authenticate = fakes.biometricGate.authenticate.bind(fakes.biometricGate);
      fakes.biometricGate.authenticate = (reason) => {
        fakes.clock.advance(4000);
        return authenticate(reason);
      };

      const result = await useCase.execute(INPUT);

      expect(result.ok && result.value.vote.castAt).toBe(at(4000));
    });
  });

  describe('a resolution that sits in a later item of the agenda', () => {
    const SECOND = { ...INPUT, resolutionId: aResolutionId('resolution-2') };

    it('can be voted on, and only that resolution is recorded in the cached meeting', async () => {
      const { fakes, useCase } = setup(aMeetingWithAgenda());

      const result = await useCase.execute({ ...SECOND, choice: VOTE_CHOICE.Abstain });

      expect(result).toEqual(
        ok({
          status: CAST_VOTE_STATUS.Submitted,
          vote: aVote({ resolutionId: aResolutionId('resolution-2'), choice: VOTE_CHOICE.Abstain }),
        }),
      );
      const cached = await fakes.meetingCache.readMeeting(aUserId(), aMeetingId());
      const meeting = cached.ok && cached.value ? cached.value.value : undefined;
      expect(meeting && findResolution(meeting, aResolutionId('resolution-2'))?.recordedVote).toBe(
        VOTE_CHOICE.Abstain,
      );
      expect(meeting && findResolution(meeting, aResolutionId())).not.toHaveProperty(
        'recordedVote',
      );
    });

    it('is refused when it is closed, even though the first resolution is open', async () => {
      const closed = anAgendaItem({
        id: anAgendaItemId('agenda-2'),
        position: 2,
        resolution: aResolution({
          id: aResolutionId('resolution-2'),
          status: RESOLUTION_STATUS.Closed,
        }),
      });
      const { useCase } = setup(
        unwrap(
          createMeeting({
            ...aMeeting(),
            summary: aMeetingSummary(),
            agenda: [anAgendaItem(), closed],
          }),
        ),
      );

      expect(await useCase.execute(SECOND)).toEqual(
        err({ code: VOTING_ERROR_CODE.ResolutionClosed }),
      );
      expect(await useCase.execute(INPUT)).toEqual(
        ok({ status: CAST_VOTE_STATUS.Submitted, vote: aVote() }),
      );
    });

    it('is refused when the meeting has no such resolution in any item', async () => {
      const { useCase } = setup(aMeetingWithAgenda());

      expect(
        await useCase.execute({ ...INPUT, resolutionId: aResolutionId('resolution-3') }),
      ).toEqual(
        err({
          code: VOTING_ERROR_CODE.ResolutionNotFound,
          resolutionId: aResolutionId('resolution-3'),
        }),
      );
    });
  });

  describe('when the meeting cannot be loaded from the server although a copy is cached', () => {
    it.each([
      ['unauthorized', unauthorized()],
      ['an unexpected failure', unexpected('HTTP 500')],
    ])('does not vote on the cached copy: %s', async (_name, failure) => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.meetings.failure = failure;

      expect(await useCase.execute(INPUT)).toEqual(err(failure));
      expect(fakes.biometricGate.prompts).toEqual([]);
      expect(fakes.votes.received).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('evicts the cached copy when the server refuses the user', async () => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.meetings.failure = unauthorized();

      await useCase.execute(INPUT);

      expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(ok(undefined));
    });

    it('leaves the cached copy when the server fails unexpectedly', async () => {
      const { fakes, useCase } = setup();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
      fakes.meetings.failure = unexpected('HTTP 500');

      await useCase.execute(INPUT);

      expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(
        ok({ value: aMeeting(), cachedAt: NOW }),
      );
    });
  });
});
