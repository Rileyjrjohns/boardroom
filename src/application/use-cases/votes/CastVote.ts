import {
  isPending,
  isRejected,
  createPendingVote,
  recordAttempt,
} from '@domain/entities/OutboxVote';
import { createVote } from '@domain/entities/Vote';
import type { Vote } from '@domain/entities/Vote';
import type { BiometricError } from '@domain/errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import type {
  NetworkUnavailableError,
  RepositoryError,
  UnexpectedError,
} from '@domain/errors/RepositoryError';
import type { SessionChangedError } from '@domain/errors/AuthenticationError';
import { storageWriteFailed } from '@domain/errors/StorageError';
import type { StorageError } from '@domain/errors/StorageError';
import { voteInProgress, votePreviouslyRejected } from '@domain/errors/VoteDeliveryError';
import type {
  VoteInProgressError,
  VotePreviouslyRejectedError,
} from '@domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE, isVotingError } from '@domain/errors/VotingError';
import type { VotingError } from '@domain/errors/VotingError';
import { checkVotingEligibility } from '@domain/policies/votingEligibility';
import { err, isErr, isOk, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { ValueOf } from '@domain/shared/constants';
import type { MeetingId, ResolutionId } from '@domain/value-objects/ids';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';

import { BIOMETRIC_REASON } from '../../ports/BiometricGate';
import type { BiometricGate } from '../../ports/BiometricGate';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { ENQUEUE_OUTCOME } from '../../ports/VoteOutbox';
import type { VoteOutbox } from '../../ports/VoteOutbox';
import type { VoteRepository } from '../../ports/VoteRepository';
import { confirmWithBiometrics } from '../../shared/confirmWithBiometrics';
import { endRefusedSession } from '../../shared/endSession';
import { loadMeeting } from '../../shared/loadMeeting';
import type { LoadMeetingDeps } from '../../shared/loadMeeting';
import { recordVoteInCache } from '../../shared/recordVoteInCache';
import { requireSameUser, requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';

export interface CastVoteDeps extends LoadMeetingDeps {
  readonly outbox: VoteOutbox;
  readonly votes: VoteRepository;
  readonly biometricGate: BiometricGate;
}

export interface CastVoteInput {
  readonly meetingId: MeetingId;
  readonly resolutionId: ResolutionId;
  readonly choice: VoteChoice;
}

/** What happened to a vote that was cast. */
export const CAST_VOTE_STATUS = {
  /** The server has recorded it. */
  Submitted: 'submitted',
  /** It could not be delivered now: it waits in the outbox, and `SyncPendingVotes` will send it. */
  Queued: 'queued',
} as const;

export type CastVoteStatus = ValueOf<typeof CAST_VOTE_STATUS>;

export interface CastVoteOutcome {
  readonly status: CastVoteStatus;
  readonly vote: Vote;
}

export type CastVoteError =
  | SessionRequiredError
  | SessionChangedError
  | RepositoryError
  | StorageError
  | VotingError
  | BiometricError
  | VoteInProgressError
  | VotePreviouslyRejectedError;

/** Why a vote could not be queued: an entry of the outbox that cannot be read holds its key. */
const UNREADABLE_ENTRY_CAUSE = 'unreadable entry holds the key';

/** The answers of the server that say nothing about the vote: it is kept and sent again later. */
type Undelivered = NetworkUnavailableError | UnexpectedError;

/**
 * Casts the vote of the signed-in user on a resolution. A cast vote is final. Steps:
 *
 * 1. refuses at once (`voteInProgress`) when a vote on the same resolution is being cast by this
 *    instance, whatever the choice: the first one is waiting for the biometric prompt, say;
 * 2. requires a valid session (its user is the voter);
 * 3. loads the meeting with the offline policy of `loadWithCacheFallback`, so a member can vote
 *    from a meeting already seen without network;
 * 4. checks the eligibility (see `checkVotingEligibility`), including a vote of the same voter
 *    already waiting in the outbox, and refuses (`votePreviouslyRejected`) when an earlier vote of
 *    the voter on this resolution is in the outbox, rejected, until they acknowledge it. The
 *    meeting may be a stale copy: the server has the last word;
 * 5. asks for the biometric confirmation, only now that the vote is allowed, so that nobody is
 *    prompted for a vote that cannot be cast;
 * 6. checks again that the same user is still signed in and the app still unlocked, because the
 *    prompt can take long: otherwise the answer is `sessionChanged` (or `appLocked`) and nothing
 *    is submitted or queued;
 * 7. builds the vote with the clock and submits it.
 *
 * Submitted: `status: 'submitted'`, and the cached copy of the meeting records the vote. The
 * network is down, or the server failed in a way that says nothing about the vote
 * (`unexpected`: it may have recorded it): the vote is put in the outbox and the status is
 * `queued`; the idempotency key makes the later replay safe. A business rejection (such as
 * `resolutionClosed` or `alreadyVoted`) is returned as an error and nothing is queued. So is
 * `unauthorized`, the server no longer accepting the session: it ends the session on the device
 * (see `endRefusedSession`), and the vote is not queued: the user signs in again and casts it again.
 * If the outbox itself refuses the vote, the failure is captured
 * and returned.
 *
 * The guard of step 1 is a field of the instance, set before the first `await`, and released
 * whatever happens: the composition root must share one instance. It does not cover two instances
 * (two screens built with their own). There the outbox, which holds one vote per voter and
 * resolution, makes the second one fail with `alreadyVoted` if both are queued, and the server
 * does the same if both are submitted.
 */
export class CastVote {
  private readonly inFlight = new Set<ResolutionId>();

  constructor(private readonly deps: CastVoteDeps) {}

  async execute(input: CastVoteInput): Promise<Result<CastVoteOutcome, CastVoteError>> {
    if (this.inFlight.has(input.resolutionId)) return err(voteInProgress());

    this.inFlight.add(input.resolutionId);
    try {
      return await this.cast(input);
    } finally {
      this.inFlight.delete(input.resolutionId);
    }
  }

  private async cast(input: CastVoteInput): Promise<Result<CastVoteOutcome, CastVoteError>> {
    const { clock, outbox, biometricGate } = this.deps;
    const { meetingId, resolutionId, choice } = input;

    const session = await requireSession(this.deps);
    if (isErr(session)) return session;
    const voterId = session.value.user.id;

    const loaded = await loadMeeting(this.deps, voterId, meetingId);
    if (isErr(loaded)) return loaded;

    const found = await outbox.findByResolution(resolutionId, voterId);
    if (isErr(found)) return found;

    const eligible = checkVotingEligibility({
      meeting: loaded.value.data,
      resolutionId,
      voterId,
      queuedVotes: found.value.filter(isPending),
      now: clock.now(),
    });
    if (isErr(eligible)) return eligible;

    const rejected = found.value.find(isRejected);
    if (rejected !== undefined) return err(votePreviouslyRejected(rejected.reason));

    const confirmed = await confirmWithBiometrics(biometricGate, BIOMETRIC_REASON.ConfirmVote);
    if (isErr(confirmed)) return confirmed;

    // The prompt waits for the user, as long as they like: the one who confirms is the one who
    // voted only if the session and the lock are still what they were when the prompt was shown.
    const stillSignedIn = await requireSameUser(this.deps, voterId);
    if (isErr(stillSignedIn)) return stillSignedIn;

    return this.send(createVote({ resolutionId, meetingId, voterId, choice, castAt: clock.now() }));
  }

  private async send(vote: Vote): Promise<Result<CastVoteOutcome, CastVoteError>> {
    const { votes, monitoring } = this.deps;
    const attributes = {
      [LOG_ATTRIBUTE.MeetingId]: vote.meetingId,
      [LOG_ATTRIBUTE.ResolutionId]: vote.resolutionId,
    };

    const submission = await votes.submit(vote);
    if (isOk(submission)) {
      await recordVoteInCache(this.deps, vote);
      monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.VoteSubmitted, attributes);
      return ok({ status: CAST_VOTE_STATUS.Submitted, vote });
    }

    const { error } = submission;
    if (
      error.code === REPOSITORY_ERROR_CODE.NetworkUnavailable ||
      error.code === REPOSITORY_ERROR_CODE.Unexpected
    ) {
      return this.queue(vote, error);
    }

    if (isVotingError(error)) {
      monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.VoteRejected, {
        ...attributes,
        [LOG_ATTRIBUTE.ErrorCode]: error.code,
      });
    } else if (error.code === REPOSITORY_ERROR_CODE.Unauthorized) {
      await endRefusedSession(this.deps, vote.voterId);
    }
    return err(error);
  }

  /** Keeps a vote that could not be delivered, to be sent later. */
  private async queue(
    vote: Vote,
    cause: Undelivered,
  ): Promise<Result<CastVoteOutcome, CastVoteError>> {
    const { clock, outbox, monitoring } = this.deps;
    const attributes = {
      [LOG_ATTRIBUTE.MeetingId]: vote.meetingId,
      [LOG_ATTRIBUTE.ResolutionId]: vote.resolutionId,
    };

    // An unexpected answer is swallowed here, and counts as an attempt: capture it.
    const failedOnServer = cause.code === REPOSITORY_ERROR_CODE.Unexpected;
    if (failedOnServer)
      monitoring.captureError(MONITORING_EVENT.VoteSubmitFailed, cause, attributes);
    const pending = createPendingVote(vote, clock.now());

    const enqueued = await outbox.enqueue(failedOnServer ? recordAttempt(pending) : pending);
    if (isErr(enqueued)) {
      monitoring.captureError(MONITORING_EVENT.VoteEnqueueFailed, enqueued.error, attributes);
      return enqueued;
    }

    if (enqueued.value.outcome === ENQUEUE_OUTCOME.HeldByUnreadable) {
      // An entry nobody can read sits under the key of this vote. It is not overwritten: the vote
      // is not queued, and the failure says why. The user can discard the entry from the list of
      // pending votes, and cast the vote again.
      const blocked = storageWriteFailed(UNREADABLE_ENTRY_CAUSE);
      monitoring.captureError(MONITORING_EVENT.VoteEnqueueFailed, blocked, attributes);
      return err(blocked);
    }
    if (enqueued.value.outcome === ENQUEUE_OUTCOME.AlreadyQueued) {
      const { existing } = enqueued.value;
      return err(
        isPending(existing)
          ? { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Queued }
          : votePreviouslyRejected(existing.reason),
      );
    }

    monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.VoteQueued, attributes);
    return ok({ status: CAST_VOTE_STATUS.Queued, vote });
  }
}
