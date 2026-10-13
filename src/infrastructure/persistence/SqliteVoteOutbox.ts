import { z } from 'zod';

import { OUTBOX_STATUS, rejectVote, restorePendingVote } from '@domain/entities/OutboxVote';
import type { OutboxVote, PendingVote } from '@domain/entities/OutboxVote';
import { createVote } from '@domain/entities/Vote';
import type { IdempotencyKey } from '@domain/entities/Vote';
import { storageReadFailed } from '@domain/errors/StorageError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import type { RejectionReason } from '@domain/errors/VoteDeliveryError';
import { andThen, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseMeetingId, parseResolutionId, parseUserId } from '@domain/value-objects/ids';
import type { ResolutionId, UserId } from '@domain/value-objects/ids';
import { parseInstant } from '@domain/value-objects/Instant';
import type { Instant } from '@domain/value-objects/Instant';
import { parseVoteChoice } from '@domain/value-objects/VoteChoice';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import type { Monitoring } from '@application/ports/Monitoring';
import { ENQUEUE_OUTCOME } from '@application/ports/VoteOutbox';
import type { EnqueueResult, VoteOutbox } from '@application/ports/VoteOutbox';

import {
  toRejectionReason,
  toRejectionReasonWire,
  rejectionReasonSchema,
} from '../shared/rejectionSchemas';

import { DEFAULT_STATEMENT_TIMEOUT_MILLIS, guardedRead, guardedWrite } from './guarded';
import { COLUMN, TABLE } from './schema';
import type { SqlDatabase, SqlRow } from './SqlDatabase';

export interface SqliteVoteOutboxOptions {
  readonly database: SqlDatabase;
  readonly monitoring: Monitoring;
  /** Defaults to `DEFAULT_STATEMENT_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/** What a row of the outbox is called in the logs. */
const OUTBOX_VOTE_RESOURCE = 'outboxVote';
const UNREADABLE_CAUSE = 'stored vote unreadable';

const C = COLUMN;
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

const SELECT = `SELECT ${COLUMNS} FROM ${TABLE.OutboxVotes}`;
const SELECT_BY_KEY = `${SELECT} WHERE ${C.IdempotencyKey} = ?`;
const SELECT_BY_VOTER = `${SELECT} WHERE ${C.VoterId} = ? ORDER BY ${C.Sequence}`;
const SELECT_BY_RESOLUTION = `${SELECT} WHERE ${C.VoterId} = ? AND ${C.ResolutionId} = ? ORDER BY ${C.Sequence}`;
const INSERT = `INSERT INTO ${TABLE.OutboxVotes}
  (${C.IdempotencyKey}, ${C.VoterId}, ${C.ResolutionId}, ${C.MeetingId}, ${C.Choice}, ${C.CastAt},
   ${C.EnqueuedAt}, ${C.Attempts}, ${C.Status})
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const MARK_ATTEMPT = `UPDATE ${TABLE.OutboxVotes} SET ${C.Attempts} = ${C.Attempts} + 1
  WHERE ${C.IdempotencyKey} = ? AND ${C.Status} = ?`;
const REJECT = `UPDATE ${TABLE.OutboxVotes}
  SET ${C.Status} = ?, ${C.RejectionReason} = ?, ${C.RejectedAt} = ?
  WHERE ${C.IdempotencyKey} = ? AND ${C.Status} = ?`;
const REMOVE = `DELETE FROM ${TABLE.OutboxVotes} WHERE ${C.IdempotencyKey} = ?`;
const REMOVE_ROW = `DELETE FROM ${TABLE.OutboxVotes} WHERE ${C.Sequence} = ?`;

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
 *   else) is not a vote anybody can send: it is reported to the monitoring, without its content,
 *   left out of the answer and deleted. It never throws.
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
            const existing = this.decode(held);
            if (existing !== undefined) {
              return { outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing };
            }
            // A row that holds the key but is no vote: it makes room for the vote it was meant to be.
            await tx.run(REMOVE_ROW, [Number(held[C.Sequence])]);
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

  list(voterId: UserId): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    return this.readVotes(SELECT_BY_VOTER, [voterId]);
  }

  findByResolution(
    resolutionId: ResolutionId,
    voterId: UserId,
  ): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    return this.readVotes(SELECT_BY_RESOLUTION, [voterId, resolutionId]);
  }

  markAttempt(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    return this.write(MARK_ATTEMPT, [key, OUTBOX_STATUS.Pending]);
  }

  reject(
    key: IdempotencyKey,
    reason: RejectionReason,
    rejectedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    return this.write(REJECT, [
      OUTBOX_STATUS.Rejected,
      JSON.stringify(toRejectionReasonWire(reason)),
      rejectedAt,
      key,
      OUTBOX_STATUS.Pending,
    ]);
  }

  remove(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    return this.write(REMOVE, [key]);
  }

  private timeout(): number {
    return this.options.timeoutMillis ?? DEFAULT_STATEMENT_TIMEOUT_MILLIS;
  }

  private async write(
    statement: string,
    params: readonly (string | number)[],
  ): Promise<Result<void, StorageWriteFailedError>> {
    const { database } = this.options;
    const done = await guardedWrite(() => database.run(statement, params), this.timeout());
    return done.ok ? ok(undefined) : done;
  }

  private async readVotes(
    statement: string,
    params: readonly string[],
  ): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    const { database } = this.options;
    const rows = await guardedRead(() => database.all(statement, params), this.timeout());
    if (!rows.ok) return rows;

    const votes: OutboxVote[] = [];
    const unreadable: number[] = [];
    for (const row of rows.value) {
      const vote = this.decode(row);
      if (vote === undefined) unreadable.push(Number(row[C.Sequence]));
      else votes.push(vote);
    }
    for (const sequence of unreadable) {
      // Best effort: a row that cannot be read is left out whether or not it can be deleted.
      await guardedWrite(() => database.run(REMOVE_ROW, [sequence]), this.timeout());
    }
    return ok(votes);
  }

  /** The vote a row holds, or `undefined` (and a report to the monitoring) when it holds none. */
  private decode(raw: SqlRow): OutboxVote | undefined {
    const decoded = toOutboxVote(raw);
    if (decoded === undefined) {
      this.options.monitoring.captureError(
        MONITORING_EVENT.StoredRowDiscarded,
        storageReadFailed(UNREADABLE_CAUSE),
        { [LOG_ATTRIBUTE.Resource]: OUTBOX_VOTE_RESOURCE },
      );
    }
    return decoded;
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
