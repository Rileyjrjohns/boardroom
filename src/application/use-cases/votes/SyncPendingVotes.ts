import { isPending, recordAttempt } from '@domain/entities/OutboxVote';
import type { PendingVote } from '@domain/entities/OutboxVote';
import { sessionChanged } from '@domain/errors/AuthenticationError';
import type { SessionChangedError } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import type {
  NetworkUnavailableError,
  UnauthorizedError,
  UnexpectedError,
} from '@domain/errors/RepositoryError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { voteUndeliverable } from '@domain/errors/VoteDeliveryError';
import type { RejectionReason } from '@domain/errors/VoteDeliveryError';
import { isVotingError } from '@domain/errors/VotingError';
import { err, isErr, isOk, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { ResolutionId, UserId } from '@domain/value-objects/ids';

import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import type { VoteOutbox } from '../../ports/VoteOutbox';
import type { VoteRepository } from '../../ports/VoteRepository';
import { endRefusedSession } from '../../shared/endSession';
import { recordVoteInCache } from '../../shared/recordVoteInCache';
import { requireSession } from '../../shared/requireSession';
import type { RequireSessionDeps, SessionRequiredError } from '../../shared/requireSession';

export interface SyncPendingVotesDeps extends RequireSessionDeps {
  readonly outbox: VoteOutbox;
  readonly votes: VoteRepository;
  /**
   * Configuration, set once by the composition root: after this many unexpected failures a vote is
   * given up (rejected as `voteUndeliverable`) instead of being retried for ever.
   */
  readonly maxAttempts: number;
}

export const SYNC_OUTCOME = {
  /** The whole queue was gone through. Votes that failed unexpectedly may remain, to be retried. */
  Completed: 'completed',
  /** The run stopped early on a condition that concerns every vote; the rest is still pending. */
  Interrupted: 'interrupted',
  /** Another run of the same use case was in progress: nothing was done. */
  AlreadyRunning: 'alreadyRunning',
} as const;

/** What stops a whole run: the network or the session is gone, or the outbox cannot be written. */
export type SyncInterruption =
  | NetworkUnavailableError
  | UnauthorizedError
  | StorageWriteFailedError
  | SessionRequiredError
  | SessionChangedError;

/** A vote that the server refused, as a run reports it: which resolution, and why. Never the choice. */
export interface RejectedSync {
  readonly resolutionId: ResolutionId;
  readonly reason: RejectionReason;
}

/**
 * What a run did. It names resolutions and reasons only: the choice of a vote is a secret ballot,
 * and a report is built to be shown, logged and passed around. The votes themselves stay in the
 * outbox, where they are read by the voter they belong to.
 */
export interface SyncProgress {
  /** The resolutions of the votes the server recorded; they have left the outbox. */
  readonly synced: readonly ResolutionId[];
  /** The votes moved to the rejected state during this run; they stay in the outbox. */
  readonly rejected: readonly RejectedSync[];
  /** The pending votes of the user still in the outbox, counted after the run. */
  readonly remaining: number;
}

export interface SyncAlreadyRunning {
  readonly outcome: typeof SYNC_OUTCOME.AlreadyRunning;
}

export interface SyncCompleted extends SyncProgress {
  readonly outcome: typeof SYNC_OUTCOME.Completed;
}

export interface SyncInterrupted extends SyncProgress {
  readonly outcome: typeof SYNC_OUTCOME.Interrupted;
  readonly interruptedBy: SyncInterruption;
}

export type SyncReport = SyncAlreadyRunning | SyncCompleted | SyncInterrupted;

/** What fails the whole call, before any vote is sent: no valid session, or an outbox that cannot be read. */
export type SyncPendingVotesError = SessionRequiredError | StorageReadFailedError;

const SETTLEMENT = {
  Synced: 'synced',
  Rejected: 'rejected',
  /** The vote failed in a way that says nothing about it: it stays pending, the run goes on. */
  Deferred: 'deferred',
  Interrupted: 'interrupted',
} as const;

/** What became of one pending vote. */
type Settlement =
  | { readonly kind: typeof SETTLEMENT.Synced }
  | { readonly kind: typeof SETTLEMENT.Rejected; readonly rejected: RejectedSync }
  | { readonly kind: typeof SETTLEMENT.Deferred }
  | { readonly kind: typeof SETTLEMENT.Interrupted; readonly cause: SyncInterruption };

/**
 * Sends the votes of the signed-in user that wait in the outbox, oldest first, one at a time. A
 * rejected vote is never sent again.
 *
 * - Recorded by the server: removed from the outbox, reported in `synced`, and recorded on the
 *   cached copy of its meeting (`recordVoteInCache`).
 * - Rejected for a business reason (closed, already voted, ...): sending it again would change
 *   nothing, so it is moved to the rejected state, with its reason, and reported in `rejected`. It
 *   stays in the outbox until the user acknowledges it (`AcknowledgeRejectedVote`).
 * - `unexpected`: the server failed in a way that says nothing about the vote. The failure is
 *   captured, an attempt is counted on the vote, and the run goes on with the next one. After
 *   `maxAttempts` attempts the vote is moved to the rejected state with the reason
 *   `voteUndeliverable`, so that the user sees it and one bad vote cannot block the others for ever.
 * - `networkUnavailable` and `unauthorized` concern every vote, not this one: the run stops at once
 *   and the vote and the ones after it stay pending. No attempt is counted, so being offline never
 *   makes a vote undeliverable. `unauthorized` is the server no longer accepting the session: it
 *   also ends the session on the device (see `endRefusedSession`), the votes staying in the outbox
 *   for the next time their voter signs in.
 * - The session is checked again before each vote. If nobody is signed in any more, or somebody
 *   else is, the run stops: the votes of a user are never sent under another
 *   session. (The adapter backs this up: it answers `unauthorized` to a vote whose voter is not
 *   the authenticated user.)
 * - A write to the outbox that fails stops the run too, and a vote is reported as settled only
 *   once it has really left its pending state.
 *
 * - It does not run while the app is locked (`appLocked`, from the session guard), and a run that
 *   meets the lock stops there. A vote was confirmed by a biometric prompt when it was cast, but
 *   the lock means that nobody has proven they are there since the app started or came back, and
 *   a locked app does not talk to the server with the session of its user, nor does it report on
 *   their votes. The presentation triggers a run when the app returns to the foreground, and that
 *   run follows the unlock. The votes wait in the outbox, and the loss is a delay.
 *
 * Only the votes of the signed-in user are read (the port is scoped by voter).
 *
 * Who calls it: the presentation or the composition root, when connectivity is regained and when
 * the app returns to the foreground. The application layer does not watch the network.
 *
 * What is guaranteed about concurrent calls: while a run is in progress on this instance, another
 * call returns `alreadyRunning` immediately and does nothing, so one instance never sends the same
 * vote twice at once. The guard is an instance field, set before the first `await`: the
 * composition root must therefore share one instance. It does not protect two instances or two
 * processes (a background task next to the app). There the idempotency key keeps a double
 * send harmless: the server records the vote once.
 */
export class SyncPendingVotes {
  private running = false;

  constructor(private readonly deps: SyncPendingVotesDeps) {}

  async execute(): Promise<Result<SyncReport, SyncPendingVotesError>> {
    if (this.running) return ok({ outcome: SYNC_OUTCOME.AlreadyRunning });

    this.running = true;
    try {
      return await this.run();
    } finally {
      this.running = false;
    }
  }

  private async run(): Promise<Result<SyncCompleted | SyncInterrupted, SyncPendingVotesError>> {
    const { outbox, monitoring } = this.deps;

    const session = await requireSession(this.deps);
    if (isErr(session)) return session;
    const voterId = session.value.user.id;

    const listed = await outbox.list(voterId);
    if (isErr(listed)) return listed;
    const queue = listed.value.votes.filter(isPending);

    const synced: ResolutionId[] = [];
    const rejected: RejectedSync[] = [];
    let interruption: SyncInterruption | undefined;

    for (const pending of queue) {
      const stillSignedIn = await this.checkSession(voterId);
      if (isErr(stillSignedIn)) {
        interruption = stillSignedIn.error;
        break;
      }

      const settlement = await this.settle(pending);
      if (settlement.kind === SETTLEMENT.Interrupted) {
        interruption = settlement.cause;
        break;
      }
      if (settlement.kind === SETTLEMENT.Synced) synced.push(pending.vote.resolutionId);
      if (settlement.kind === SETTLEMENT.Rejected) rejected.push(settlement.rejected);
    }

    const progress: SyncProgress = {
      synced,
      rejected,
      remaining: await this.countRemaining(voterId, queue.length - synced.length - rejected.length),
    };
    const attributes = {
      [LOG_ATTRIBUTE.Synced]: synced.length,
      [LOG_ATTRIBUTE.Rejected]: rejected.length,
      [LOG_ATTRIBUTE.Remaining]: progress.remaining,
    };

    if (interruption === undefined) {
      monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.VoteSyncCompleted, attributes);
      return ok({ outcome: SYNC_OUTCOME.Completed, ...progress });
    }
    monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.VoteSyncInterrupted, {
      ...attributes,
      [LOG_ATTRIBUTE.ErrorCode]: interruption.code,
    });
    return ok({ outcome: SYNC_OUTCOME.Interrupted, ...progress, interruptedBy: interruption });
  }

  /** Is the user the run started for still the signed-in user? */
  private async checkSession(
    voterId: UserId,
  ): Promise<Result<void, SessionRequiredError | SessionChangedError>> {
    const session = await requireSession(this.deps);
    if (isErr(session)) return session;
    return session.value.user.id === voterId ? ok(undefined) : err(sessionChanged());
  }

  /**
   * The pending votes still in the outbox, read again after the run since the outbox may have
   * changed while it ran (a vote cast meanwhile, say). If it cannot be read, the failure is
   * captured and the count falls back on what the run itself knows.
   */
  private async countRemaining(voterId: UserId, fallback: number): Promise<number> {
    const { outbox, monitoring } = this.deps;

    const listed = await outbox.list(voterId);
    if (isErr(listed)) {
      monitoring.captureError(MONITORING_EVENT.OutboxReadFailed, listed.error);
      return fallback;
    }
    return listed.value.votes.filter(isPending).length;
  }

  /** Sends one vote and brings the outbox in line with the answer. */
  private async settle(pending: PendingVote): Promise<Settlement> {
    const submission = await this.deps.votes.submit(pending.vote);
    if (isOk(submission)) return this.leaveOutbox(pending);

    const { error } = submission;
    if (isVotingError(error)) return this.reject(pending, error);
    if (error.code === REPOSITORY_ERROR_CODE.Unexpected) return this.deferOrGiveUp(pending, error);
    if (error.code === REPOSITORY_ERROR_CODE.Unauthorized) {
      await endRefusedSession(this.deps, pending.vote.voterId);
    }
    return { kind: SETTLEMENT.Interrupted, cause: error };
  }

  /** The server has recorded the vote: it must not be sent again, so it leaves the outbox. */
  private async leaveOutbox(pending: PendingVote): Promise<Settlement> {
    const removed = await this.deps.outbox.remove(pending.vote.idempotencyKey);
    if (isErr(removed)) return { kind: SETTLEMENT.Interrupted, cause: removed.error };

    await recordVoteInCache(this.deps, pending.vote);
    return { kind: SETTLEMENT.Synced };
  }

  /** The vote will never be sent: it moves to the rejected state, and stays there. */
  private async reject(pending: PendingVote, reason: RejectionReason): Promise<Settlement> {
    const { clock, outbox, monitoring } = this.deps;
    const rejectedAt = clock.now();

    const moved = await outbox.reject(pending.vote.idempotencyKey, reason, rejectedAt);
    if (isErr(moved)) return { kind: SETTLEMENT.Interrupted, cause: moved.error };

    monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.VoteRejected, {
      [LOG_ATTRIBUTE.ResolutionId]: pending.vote.resolutionId,
      [LOG_ATTRIBUTE.ErrorCode]: reason.code,
      [LOG_ATTRIBUTE.Attempts]: pending.attempts,
    });
    return {
      kind: SETTLEMENT.Rejected,
      rejected: { resolutionId: pending.vote.resolutionId, reason },
    };
  }

  /** An unexpected failure: counts an attempt, and gives the vote up once there are too many. */
  private async deferOrGiveUp(pending: PendingVote, cause: UnexpectedError): Promise<Settlement> {
    const { outbox, monitoring, maxAttempts } = this.deps;
    const attributes = { [LOG_ATTRIBUTE.ResolutionId]: pending.vote.resolutionId };

    monitoring.captureError(MONITORING_EVENT.VoteSubmitFailed, cause, attributes);
    const marked = await outbox.markAttempt(pending.vote.idempotencyKey);
    if (isErr(marked)) {
      monitoring.captureError(MONITORING_EVENT.VoteAttemptNotRecorded, marked.error, attributes);
    }

    const attempted = recordAttempt(pending);
    if (attempted.attempts < maxAttempts) return { kind: SETTLEMENT.Deferred };
    return this.reject(attempted, voteUndeliverable(attempted.attempts));
  }
}
