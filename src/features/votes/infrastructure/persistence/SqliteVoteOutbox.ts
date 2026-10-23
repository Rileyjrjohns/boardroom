import { z } from 'zod';

import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import type {
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import type { RejectionReason } from '@features/votes/domain/errors/VoteDeliveryError';
import { andThen, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { parseInstant } from '@core/domain/value-objects/Instant';
import type { Instant } from '@core/domain/value-objects/Instant';
import { parseMeetingId, parseResolutionId, parseUserId } from '@core/domain/value-objects/ids';
import type { ResolutionId, UserId } from '@core/domain/value-objects/ids';
import type { SqlDatabase, SqlRow } from '@core/infrastructure/persistence/SqlDatabase';
import {
  DEFAULT_STATEMENT_TIMEOUT_MILLIS,
  guardedRead,
  guardedWrite,
} from '@core/infrastructure/persistence/guarded';
import { parseVoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';
import { ENQUEUE_OUTCOME } from '@features/votes/application/ports/VoteOutbox';
import type {
  EnqueueResult,
  OutboxListing,
  VoteOutbox,
} from '@features/votes/application/ports/VoteOutbox';
import {
  OUTBOX_STATUS,
  rejectVote,
  restorePendingVote,
} from '@features/votes/domain/entities/OutboxVote';
import type { OutboxVote, PendingVote } from '@features/votes/domain/entities/OutboxVote';
import { createVote } from '@features/votes/domain/entities/Vote';
import type { IdempotencyKey } from '@features/votes/domain/entities/Vote';

import {
  toRejectionReason,
  toRejectionReasonWire,
  rejectionReasonSchema,
} from '../rejectionSchemas';

import { OUTBOX_QUARANTINED, VOTE_COLUMN, VOTE_TABLE } from './schema';

export interface SqliteVoteOutboxOptions {
  readonly database: SqlDatabase;
  readonly monitoring: Monitoring;
  /** Defaults to `DEFAULT_STATEMENT_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/** What a row of the outbox is called in the logs. */
const OUTBOX_VOTE_RESOURCE = 'outboxVote';
const UNREADABLE_CAUSE = 'stored vote unreadable';

/** What a row came to, when it was read. */
const ROW = {
  Vote: 'vote',
  Unreadable: 'unreadable',
} as const;

type DecodedRow =
  | { readonly kind: typeof ROW.Vote; readonly vote: OutboxVote }
  | { readonly kind: typeof ROW.Unreadable; readonly sequence: number; readonly known: boolean };

const C = VOTE_COLUMN;
const COLUMNS = [
  C.Sequence,
  C.IdempotencyKey,
  C.VoterId,
  C.ResolutionId,
  C.MeetingId,
  C.Choice,
  C.CastAt,
  C.EnqueuedAt,
  C.Attempts,
  C.Status,
  C.RejectionReason,
  C.RejectedAt,
].join(', ');

const SELECT = `SELECT ${COLUMNS} FROM ${VOTE_TABLE.Outbox}`;
const SELECT_BY_KEY = `${SELECT} WHERE ${C.IdempotencyKey} = ?`;
const SELECT_BY_VOTER = `${SELECT} WHERE ${C.VoterId} = ? ORDER BY ${C.Sequence}`;
const SELECT_BY_RESOLUTION = `${SELECT} WHERE ${C.VoterId} = ? AND ${C.ResolutionId} = ? ORDER BY ${C.Sequence}`;
const INSERT = `INSERT INTO ${VOTE_TABLE.Outbox}
  (${C.IdempotencyKey}, ${C.VoterId}, ${C.ResolutionId}, ${C.MeetingId}, ${C.Choice}, ${C.CastAt},
   ${C.EnqueuedAt}, ${C.Attempts}, ${C.Status})
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const MARK_ATTEMPT = `UPDATE ${VOTE_TABLE.Outbox} SET ${C.Attempts} = ${C.Attempts} + 1
  WHERE ${C.IdempotencyKey} = ? AND ${C.Status} = ?`;
const REJECT = `UPDATE ${VOTE_TABLE.Outbox}
  SET ${C.Status} = ?, ${C.RejectionReason} = ?, ${C.RejectedAt} = ?
  WHERE ${C.IdempotencyKey} = ? AND ${C.Status} = ?`;
const REMOVE = `DELETE FROM ${VOTE_TABLE.Outbox} WHERE ${C.IdempotencyKey} = ?`;
const QUARANTINE = `UPDATE ${VOTE_TABLE.Outbox} SET ${C.Status} = ? WHERE ${C.Sequence} = ?`;
const DISCARD_ROW = `DELETE FROM ${VOTE_TABLE.Outbox} WHERE ${C.Sequence} = ?`;

/** The columns of a row, as the engine hands them over. */
const rowSchema = z.object({
  [C.Sequence]: z.number(),
  [C.IdempotencyKey]: z.string(),
  [C.VoterId]: z.string(),
  [C.ResolutionId]: z.string(),
  [C.MeetingId]: z.string(),
  [C.Choice]: z.string(),
  [C.CastAt]: z.number(),
  [C.EnqueuedAt]: z.number(),
  [C.Attempts]: z.number(),
  [C.Status]: z.string(),
  [C.RejectionReason]: z.string().nullable(),
  [C.RejectedAt]: z.number().nullable(),
});

type Row = z.output<typeof rowSchema>;

/**
 * The outbox of votes on SQLite: durable, first in first out by the order of enqueueing (the
 * `sequence` of the row, which only grows: never a timestamp), scoped by voter.
 *
 * - A vote is held in columns, found by its whole idempotency key (a `UNIQUE` column compared byte
 *   for byte: two keys that share a prefix or differ by case are two votes). `enqueue` checks the
 *   key and inserts in one transaction, so two callers with the same key enqueue it once and both
 *   are told.
 * - Pending or rejected is a column with a check: a rejected vote always has its reason and its
 *   instant, a pending one never does.
 * - What is read back is checked against the factories of the domain, and the key must be the one
 *   the vote derives. A row that no longer passes (the file was altered, or written by something
 *   else) is not a vote anybody can send, but it may be the only trace of one: it is **quarantined**,
 *   not deleted. Its status becomes `quarantined` and nothing else about it changes, it is reported
 *   to the monitoring without its content, it is left out of the answers and counted in `list`, a
 *   vote queued under its key is refused rather than written over it, and only `discardUnreadable`
 *   deletes it. A row is attributed to a voter by its `voter_id` text, whatever the rest holds; one
 *   whose `voter_id` is no voter's belongs to nobody who can ever sign in, and stays where it is.
 *   It never throws.
 * - Every call settles: a statement that does not answer in time is a storage error.
 *
 * It holds the choices of a secret ballot and outlives the sign-out, so the database it lives in
 * is encrypted (see `openProtectedDatabase`).
 */
export class SqliteVoteOutbox implements VoteOutbox {
  constructor(private readonly options: SqliteVoteOutboxOptions) {}

  enqueue(pending: PendingVote): Promise<Result<EnqueueResult, StorageWriteFailedError>> {
    const { database } = this.options;
    const { vote } = pending;
    return guardedWrite(
      () =>
        database.transaction(async (tx): Promise<EnqueueResult> => {
          const rows = await tx.all(SELECT_BY_KEY, [vote.idempotencyKey]);
          const [held] = rows;
          if (held !== undefined) {
            const row = this.decode(held);
            if (row.kind === ROW.Vote) {
              return { outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing: row.vote };
            }
            // A row that holds the key but is no vote is kept as it is, and the vote is not queued.
            if (!row.known) await tx.run(QUARANTINE, [OUTBOX_QUARANTINED, row.sequence]);
            return { outcome: ENQUEUE_OUTCOME.HeldByUnreadable };
          }
          await tx.run(INSERT, [
            vote.idempotencyKey,
            vote.voterId,
            vote.resolutionId,
            vote.meetingId,
            vote.choice,
            vote.castAt,
            pending.enqueuedAt,
            pending.attempts,
            OUTBOX_STATUS.Pending,
          ]);
          return { outcome: ENQUEUE_OUTCOME.Enqueued };
        }),
      this.timeout(),
    );
  }

  list(voterId: UserId): Promise<Result<OutboxListing, StorageReadFailedError>> {
    return this.readVotes(SELECT_BY_VOTER, [voterId]);
  }

  async findByResolution(
    resolutionId: ResolutionId,
    voterId: UserId,
  ): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    const read = await this.readVotes(SELECT_BY_RESOLUTION, [voterId, resolutionId]);
    return read.ok ? ok(read.value.votes) : read;
  }

  async discardUnreadable(voterId: UserId): Promise<Result<number, StorageWriteFailedError>> {
    const { database } = this.options;
    return guardedWrite(
      () =>
        database.transaction(async (tx) => {
          let discarded = 0;
          for (const raw of await tx.all(SELECT_BY_VOTER, [voterId])) {
            const row = this.decode(raw, { report: false });
            if (row.kind === ROW.Vote) continue;
            await tx.run(DISCARD_ROW, [row.sequence]);
            discarded += 1;
          }
          return discarded;
        }),
      this.timeout(),
    );
  }

  markAttempt(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    return this.changeVote(key, MARK_ATTEMPT, [key, OUTBOX_STATUS.Pending]);
  }

  reject(
    key: IdempotencyKey,
    reason: RejectionReason,
    rejectedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    return this.changeVote(key, REJECT, [
      OUTBOX_STATUS.Rejected,
      JSON.stringify(toRejectionReasonWire(reason)),
      rejectedAt,
      key,
      OUTBOX_STATUS.Pending,
    ]);
  }

  remove(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    return this.changeVote(key, REMOVE, [key]);
  }

  private timeout(): number {
    return this.options.timeoutMillis ?? DEFAULT_STATEMENT_TIMEOUT_MILLIS;
  }

  /**
   * Runs a statement that changes the vote held under a key, only if the row under that key can be
   * read as a vote. The row is looked at first, in the same transaction: a row that cannot be read
   * is not the outbox's to change, nor to delete, whatever its status says. It is quarantined if it
   * was not already, and the statement is not run.
   */
  private async changeVote(
    key: IdempotencyKey,
    statement: string,
    params: readonly (string | number)[],
  ): Promise<Result<void, StorageWriteFailedError>> {
    const { database } = this.options;
    const done = await guardedWrite(
      () =>
        database.transaction(async (tx) => {
          const [held] = await tx.all(SELECT_BY_KEY, [key]);
          if (held === undefined) return;

          const row = this.decode(held);
          if (row.kind === ROW.Vote) {
            await tx.run(statement, params);
          } else if (!row.known) {
            await tx.run(QUARANTINE, [OUTBOX_QUARANTINED, row.sequence]);
          }
        }),
      this.timeout(),
    );
    return done.ok ? ok(undefined) : done;
  }

  private async readVotes(
    statement: string,
    params: readonly string[],
  ): Promise<Result<OutboxListing, StorageReadFailedError>> {
    const { database } = this.options;
    const rows = await guardedRead(() => database.all(statement, params), this.timeout());
    if (!rows.ok) return rows;

    const votes: OutboxVote[] = [];
    let unreadable = 0;
    for (const raw of rows.value) {
      const row = this.decode(raw);
      if (row.kind === ROW.Vote) {
        votes.push(row.vote);
        continue;
      }
      unreadable += 1;
      if (!row.known) {
        // Best effort: the row is left out of the answer whether or not it can be marked, and it
        // is looked at again at the next read.
        await guardedWrite(
          () => database.run(QUARANTINE, [OUTBOX_QUARANTINED, row.sequence]),
          this.timeout(),
        );
      }
    }
    return ok({ votes, unreadable });
  }

  /**
   * What a row holds: a vote, or nothing that can be read as one. A row that is already
   * quarantined is known and not reported again; one that has just failed to read is reported to
   * the monitoring, without its content (unless the caller is about to delete it for the user).
   */
  private decode(
    raw: SqlRow,
    options: { readonly report: boolean } = { report: true },
  ): DecodedRow {
    const sequence = Number(raw[C.Sequence]);
    if (raw[C.Status] === OUTBOX_QUARANTINED)
      return { kind: ROW.Unreadable, sequence, known: true };

    const vote = toOutboxVote(raw);
    if (vote !== undefined) return { kind: ROW.Vote, vote };

    if (options.report) {
      this.options.monitoring.captureError(
        MONITORING_EVENT.StoredRowQuarantined,
        storageReadFailed(UNREADABLE_CAUSE),
        { [LOG_ATTRIBUTE.Resource]: OUTBOX_VOTE_RESOURCE },
      );
    }
    return { kind: ROW.Unreadable, sequence, known: false };
  }
}

/** The vote of a row, through the factories of the domain. */
function toOutboxVote(raw: SqlRow): OutboxVote | undefined {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const row = parsed.data;

  const pending = pendingVoteOf(row);
  if (!pending.ok || pending.value.vote.idempotencyKey !== row[C.IdempotencyKey]) return undefined;

  if (row[C.Status] === OUTBOX_STATUS.Pending) {
    return row[C.RejectionReason] === null && row[C.RejectedAt] === null
      ? pending.value
      : undefined;
  }
  if (row[C.Status] !== OUTBOX_STATUS.Rejected) return undefined;

  const reason = reasonOf(row[C.RejectionReason]);
  const rejectedAt = parseInstant(row[C.RejectedAt] ?? Number.NaN);
  return reason?.ok === true && rejectedAt.ok
    ? rejectVote(pending.value, reason.value, rejectedAt.value)
    : undefined;
}

function pendingVoteOf(row: Row) {
  return andThen(parseResolutionId(row[C.ResolutionId]), (resolutionId) =>
    andThen(parseMeetingId(row[C.MeetingId]), (meetingId) =>
      andThen(parseUserId(row[C.VoterId]), (voterId) =>
        andThen(parseVoteChoice(row[C.Choice]), (choice) =>
          andThen(parseInstant(row[C.CastAt]), (castAt) =>
            andThen(parseInstant(row[C.EnqueuedAt]), (enqueuedAt) =>
              restorePendingVote({
                vote: createVote({ resolutionId, meetingId, voterId, choice, castAt }),
                enqueuedAt,
                attempts: row[C.Attempts],
              }),
            ),
          ),
        ),
      ),
    ),
  );
}

function reasonOf(stored: string | null): Result<RejectionReason, unknown> | undefined {
  if (stored === null) return undefined;
  try {
    const parsed = rejectionReasonSchema.safeParse(JSON.parse(stored));
    return parsed.success ? toRejectionReason(parsed.data) : undefined;
  } catch {
    return undefined;
  }
}
