import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import { storageReadFailed } from '@domain/errors/StorageError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { MeetingId, UserId } from '@domain/value-objects/ids';
import { parseInstant } from '@domain/value-objects/Instant';
import type { Instant } from '@domain/value-objects/Instant';
import type { Page } from '@domain/value-objects/Page';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import type { LogAttributes, Monitoring } from '@application/ports/Monitoring';
import type { CacheEntry } from '@application/ports/CacheEntry';
import type { MeetingCache, MeetingPageKey } from '@application/ports/MeetingCache';

import {
  meetingPageSchema,
  meetingSchema,
  toMeeting,
  toMeetingPage,
  toMeetingPageWire,
  toMeetingWire,
} from '../http/dto/meetingDto';
import { issuePathsOf } from '../http/dto/wire';
import { guardedRead, guardedWrite, DEFAULT_STATEMENT_TIMEOUT_MILLIS } from './guarded';
import { COLUMN, TABLE } from './schema';
import type { SqlDatabase, SqlParams } from './SqlDatabase';
import type { z } from 'zod';

export interface SqliteMeetingCacheOptions {
  readonly database: SqlDatabase;
  readonly monitoring: Monitoring;
  /** Defaults to `DEFAULT_STATEMENT_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/** What a stored entry is called in the logs. */
const STORED = {
  Page: 'meetingPage',
  Meeting: 'meeting',
} as const;

const UNREADABLE_CAUSE = 'stored entry unreadable';

// The statements. A row is found by one column for each part of its key.
const SAVE_PAGE = `INSERT OR REPLACE INTO ${TABLE.MeetingPages}
  (${COLUMN.Owner}, ${COLUMN.Period}, ${COLUMN.CursorKey}, ${COLUMN.PageLimit}, ${COLUMN.CachedAt}, ${COLUMN.Payload})
  VALUES (?, ?, ?, ?, ?, ?)`;
const PAGE_KEY = `${COLUMN.Owner} = ? AND ${COLUMN.Period} = ? AND ${COLUMN.CursorKey} = ? AND ${COLUMN.PageLimit} = ?`;
const READ_PAGE = `SELECT ${COLUMN.CachedAt}, ${COLUMN.Payload} FROM ${TABLE.MeetingPages} WHERE ${PAGE_KEY}`;
const REMOVE_PAGE = `DELETE FROM ${TABLE.MeetingPages} WHERE ${PAGE_KEY}`;

const SAVE_MEETING = `INSERT OR REPLACE INTO ${TABLE.MeetingDetails}
  (${COLUMN.Owner}, ${COLUMN.MeetingId}, ${COLUMN.CachedAt}, ${COLUMN.Payload})
  VALUES (?, ?, ?, ?)`;
const MEETING_KEY = `${COLUMN.Owner} = ? AND ${COLUMN.MeetingId} = ?`;
const READ_MEETING = `SELECT ${COLUMN.CachedAt}, ${COLUMN.Payload} FROM ${TABLE.MeetingDetails} WHERE ${MEETING_KEY}`;
const REMOVE_MEETING = `DELETE FROM ${TABLE.MeetingDetails} WHERE ${MEETING_KEY}`;

const PURGE_PAGES = `DELETE FROM ${TABLE.MeetingPages}`;
const PURGE_MEETINGS = `DELETE FROM ${TABLE.MeetingDetails}`;

/**
 * The cache of meetings on SQLite. It keeps the pages and the meetings of each owner as the API
 * writes them (JSON), under a key made of one column for each of its parts: the owner and the id
 * (or the period, the cursor and the size of the page) are never joined into one text, so two
 * different keys cannot share a row whatever characters they hold. The cursor is written as JSON
 * in its column (`null` is the first page, `"abc"` a cursor), which keeps "no cursor" apart from
 * any cursor.
 *
 * - A read checks what comes out of the database against the schema of the API and the factories
 *   of the domain. A row that no longer passes (the format moved on, the file was altered) is a
 *   miss: it is reported to the monitoring, without its content, and deleted. It never throws.
 * - A save that fails removes the older entry of the key, so that it is not served afterwards as
 *   if it were current; if that fails too, the error is still the save's.
 * - `purge` empties both tables in one transaction.
 * - Every call settles: a statement that does not answer in time is a storage error.
 */
export class SqliteMeetingCache implements MeetingCache {
  constructor(private readonly options: SqliteMeetingCacheOptions) {}

  savePage(
    owner: UserId,
    key: MeetingPageKey,
    page: Page<MeetingSummary>,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    const params = pageKeyParams(owner, key);
    return this.save(
      SAVE_PAGE,
      [...params, cachedAt, JSON.stringify(toMeetingPageWire(page))],
      REMOVE_PAGE,
      params,
    );
  }

  readPage(
    owner: UserId,
    key: MeetingPageKey,
  ): Promise<Result<CacheEntry<Page<MeetingSummary>> | undefined, StorageReadFailedError>> {
    const params = pageKeyParams(owner, key);
    return this.read(STORED.Page, READ_PAGE, params, REMOVE_PAGE, (payload) =>
      decode(payload, meetingPageSchema, toMeetingPage),
    );
  }

  removePage(owner: UserId, key: MeetingPageKey): Promise<Result<void, StorageWriteFailedError>> {
    return this.remove(REMOVE_PAGE, pageKeyParams(owner, key));
  }

  saveMeeting(
    owner: UserId,
    meeting: Meeting,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    const params = [owner, meeting.id];
    return this.save(
      SAVE_MEETING,
      [...params, cachedAt, JSON.stringify(toMeetingWire(meeting))],
      REMOVE_MEETING,
      params,
    );
  }

  readMeeting(
    owner: UserId,
    id: MeetingId,
  ): Promise<Result<CacheEntry<Meeting> | undefined, StorageReadFailedError>> {
    return this.read(STORED.Meeting, READ_MEETING, [owner, id], REMOVE_MEETING, (payload) =>
      decode(payload, meetingSchema, toMeeting),
    );
  }

  removeMeeting(owner: UserId, id: MeetingId): Promise<Result<void, StorageWriteFailedError>> {
    return this.remove(REMOVE_MEETING, [owner, id]);
  }

  async purge(): Promise<Result<void, StorageWriteFailedError>> {
    const { database } = this.options;
    return guardedWrite(
      () =>
        database.transaction(async (tx) => {
          await tx.run(PURGE_PAGES);
          await tx.run(PURGE_MEETINGS);
        }),
      this.timeout(),
    );
  }

  private timeout(): number {
    return this.options.timeoutMillis ?? DEFAULT_STATEMENT_TIMEOUT_MILLIS;
  }

  private async save(
    statement: string,
    values: SqlParams,
    removal: string,
    keyParams: SqlParams,
  ): Promise<Result<void, StorageWriteFailedError>> {
    const { database } = this.options;
    const saved = await guardedWrite(() => database.run(statement, values), this.timeout());
    if (saved.ok) return ok(undefined);
    // The entry that was there is older than the one that could not be written: do not leave it
    // to be read as if it were current. Best effort, the caller gets the failure of the save.
    await guardedWrite(() => database.run(removal, keyParams), this.timeout());
    return err(saved.error);
  }

  private remove(
    removal: string,
    keyParams: SqlParams,
  ): Promise<Result<void, StorageWriteFailedError>> {
    const { database } = this.options;
    return guardedWrite(async () => {
      await database.run(removal, keyParams);
    }, this.timeout());
  }

  private async read<T>(
    resource: (typeof STORED)[keyof typeof STORED],
    statement: string,
    keyParams: SqlParams,
    removal: string,
    decodePayload: (payload: string) => Decoded<T>,
  ): Promise<Result<CacheEntry<T> | undefined, StorageReadFailedError>> {
    const { database, monitoring } = this.options;
    const rows = await guardedRead(() => database.all(statement, keyParams), this.timeout());
    if (!rows.ok) return rows;

    const [row] = rows.value;
    if (row === undefined) return ok(undefined);

    const payload = row[COLUMN.Payload];
    const cachedAt = parseInstant(Number(row[COLUMN.CachedAt]));
    const decoded = typeof payload === 'string' ? decodePayload(payload) : undefined;
    if (decoded?.ok === true && cachedAt.ok) {
      return ok({ value: decoded.value, cachedAt: cachedAt.value });
    }

    const attributes: LogAttributes = { [LOG_ATTRIBUTE.Resource]: resource };
    if (decoded?.ok === false && decoded.issuePaths !== undefined) {
      monitoring.captureError(
        MONITORING_EVENT.StoredRowDiscarded,
        storageReadFailed(UNREADABLE_CAUSE),
        {
          ...attributes,
          [LOG_ATTRIBUTE.IssuePaths]: decoded.issuePaths,
        },
      );
    } else {
      monitoring.captureError(
        MONITORING_EVENT.StoredRowDiscarded,
        storageReadFailed(UNREADABLE_CAUSE),
        attributes,
      );
    }
    // Best effort: a row that cannot be read is a miss whether or not it can be deleted.
    await guardedWrite(() => database.run(removal, keyParams), this.timeout());
    return ok(undefined);
  }
}

/** The key of a page, one value for each column. */
function pageKeyParams(owner: UserId, { period, cursor, limit }: MeetingPageKey): SqlParams {
  return [owner, period, JSON.stringify(cursor ?? null), limit];
}

type Decoded<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issuePaths?: string };

/** A payload read back: it is JSON, it has the shape of the API, and its values pass the domain. */
function decode<S extends z.ZodType, T>(
  payload: string,
  schema: S,
  build: (wire: z.output<S>) => Result<T, unknown>,
): Decoded<T> {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return { ok: false };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, issuePaths: issuePathsOf(parsed.error) };
  const built = build(parsed.data);
  return built.ok ? { ok: true, value: built.value } : { ok: false };
}
