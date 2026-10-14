import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseDocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId, UserId } from '@domain/value-objects/ids';
import { parseInstant } from '@domain/value-objects/Instant';
import type { Instant } from '@domain/value-objects/Instant';
import type { CacheEntry } from '@application/ports/CacheEntry';
import type { DocumentCache, ViewableDocument } from '@application/ports/DocumentCache';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import type { LogAttributes, Monitoring } from '@application/ports/Monitoring';

import { contentExists, deleteContent } from '../documents/documentContent';
import type { FileStore, FileStoreFailure } from '../files/FileStore';
import { attempt } from '../shared/attempt';
import { issuePathsOf } from '../shared/issuePaths';
import { createSerialQueue } from '../shared/serialQueue';

import { DEFAULT_STATEMENT_TIMEOUT_MILLIS } from './guarded';
import { COLUMN, TABLE } from './schema';
import type { SqlDatabase, SqlRow } from './SqlDatabase';
import { documentOf, storedDocumentOf, storedDocumentSchema } from './storedDocument';

export interface SqliteDocumentCacheOptions {
  readonly database: SqlDatabase;
  /**
   * Where the content of the documents is. The cache looks at it and deletes from it; it never
   * writes to it, the repositories do.
   */
  readonly files: FileStore;
  readonly monitoring: Monitoring;
  /** Defaults to `DEFAULT_STATEMENT_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/** What a stored entry is called in the logs. */
const RESOURCE = 'document';
const UNREADABLE_CAUSE = 'stored entry unreadable';

// The statements. A row is found by one column for each part of its key.
const KEY = `${COLUMN.Owner} = ? AND ${COLUMN.DocumentId} = ?`;
const SAVE = `INSERT OR REPLACE INTO ${TABLE.DocumentEntries}
  (${COLUMN.Owner}, ${COLUMN.DocumentId}, ${COLUMN.CachedAt}, ${COLUMN.Location}, ${COLUMN.Payload})
  VALUES (?, ?, ?, ?, ?)`;
const READ = `SELECT ${COLUMN.CachedAt}, ${COLUMN.Location}, ${COLUMN.Payload}
  FROM ${TABLE.DocumentEntries} WHERE ${KEY}`;
const LOCATION_OF = `SELECT ${COLUMN.Location} FROM ${TABLE.DocumentEntries} WHERE ${KEY}`;
const REMOVE = `DELETE FROM ${TABLE.DocumentEntries} WHERE ${KEY}`;
/** Removes an entry only while it still points where it was read to: a newer save is left alone. */
const REMOVE_WHILE_AT = `DELETE FROM ${TABLE.DocumentEntries} WHERE ${KEY} AND ${COLUMN.Location} = ?`;
const OTHERS_AT = `SELECT count(*) AS others FROM ${TABLE.DocumentEntries}
  WHERE ${COLUMN.Location} = ? AND NOT (${COLUMN.Owner} = ? AND ${COLUMN.DocumentId} = ?)`;
const ALL_LOCATIONS = `SELECT DISTINCT ${COLUMN.Location} FROM ${TABLE.DocumentEntries}`;
const REMOVE_AT = `DELETE FROM ${TABLE.DocumentEntries} WHERE ${COLUMN.Location} = ?`;
const REMOVE_ALL = `DELETE FROM ${TABLE.DocumentEntries}`;

/** What a step that touches the files answers with: a value, or the failure of the file system. */
type Step<T> = Result<T, FileStoreFailure>;

/**
 * The cache of the documents already viewed, on SQLite for the metadata and in the files of the
 * device for the content. It keeps, for each owner and document, the metadata as JSON in the
 * format of its own (`storedDocument.ts`), the instant and the location of the content, under a key
 * made of one column for each part (the owner and the id are never joined in a text, so two
 * different keys cannot share a row whatever characters they hold).
 *
 * - **The content is deleted before the entry.** `remove`, `purge` and a `save` that moves an entry
 *   to another file delete the file first, and only then drop the row; if the file cannot be
 *   deleted the call fails and the row stays, so that it can be tried again. An entry is never
 *   dropped while its file is left behind with nothing pointing at it.
 * - **Files are shared by count.** Two owners may point at the same file. The file is deleted only
 *   when no other row points at it (the index on the location answers), so one user signing out
 *   cannot take the file from another.
 * - **An entry whose content is gone is a miss** (the system emptied the caches, the file was
 *   deleted): the row is dropped, since the next request refills it.
 * - **A row that no longer reads back is a miss** (the format moved on, the file was altered, the
 *   location is no file of the store). It is reported to the monitoring, without its content, left
 *   out of the answer, and removed together with its file. It never throws.
 * - **Files that no row points at** (a download whose entry was never saved, a deletion that was
 *   interrupted, a partial file) are swept when the cache starts (`sweepOrphans`).
 * - A save that fails removes the older entry of its key, whatever its file does, so that it is
 *   not served afterwards as if it were current.
 * - Calls run one at a time, in the order they were made: a call reads, decides and writes in
 *   several steps (a row, then a file, then a row), and two callers must not interleave them.
 * - Every call settles: a statement or a file operation that does not answer in time is a storage
 *   error.
 */
export class SqliteDocumentCache implements DocumentCache {
  private readonly inOrder = createSerialQueue();

  constructor(private readonly options: SqliteDocumentCacheOptions) {}

  save(
    owner: UserId,
    viewable: ViewableDocument,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    return this.inOrder(async () => {
      const saved = await this.write(() => this.upsert(owner, viewable, cachedAt));
      if (saved.ok) return saved;
      // The entry that was there is older than the one that could not be written: do not leave it
      // to be read as if it were current, whatever happens to its file. Best effort, the caller
      // gets the failure of the save.
      await this.write(() => this.forget(owner, viewable.document.id));
      return saved;
    });
  }

  read(
    owner: UserId,
    id: DocumentId,
  ): Promise<Result<CacheEntry<ViewableDocument> | undefined, StorageReadFailedError>> {
    return this.inOrder(async () => {
      const done = await attempt(() => this.lookup(owner, id), this.timeout());
      if (!done.ok) return err(storageReadFailed(done.error.cause));
      return done.value.ok ? done.value : err(storageReadFailed(done.value.error.cause));
    });
  }

  remove(owner: UserId, id: DocumentId): Promise<Result<void, StorageWriteFailedError>> {
    return this.inOrder(() => this.write(() => this.removeEntry(owner, id)));
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    return this.inOrder(() => this.write(() => this.removeEverything()));
  }

  /**
   * Deletes the files of the documents that no entry points at: what a download left when its
   * entry was never saved, what a deletion that was interrupted left, a file that was being written
   * when the app stopped. It runs when the cache starts, before any download, so no file it finds
   * can be one that is about to be saved. A file that cannot be deleted is reported and left for
   * the next start; the others are still deleted. Fails when the files or the database cannot be
   * read, or a file is left.
   */
  sweepOrphans(): Promise<Result<void, StorageWriteFailedError>> {
    return this.inOrder(() => this.write(() => this.sweep()));
  }

  private timeout(): number {
    return this.options.timeoutMillis ?? DEFAULT_STATEMENT_TIMEOUT_MILLIS;
  }

  /** A write: the database and the files, in bounded time, with the failure of whichever fails. */
  private async write(
    work: () => Promise<Step<void>>,
  ): Promise<Result<void, StorageWriteFailedError>> {
    const done = await attempt(work, this.timeout());
    if (!done.ok) return err(storageWriteFailed(done.error.cause));
    return done.value.ok ? ok(undefined) : err(storageWriteFailed(done.value.error.cause));
  }

  private async upsert(
    owner: UserId,
    { document, location }: ViewableDocument,
    cachedAt: Instant,
  ): Promise<Step<void>> {
    const { database } = this.options;
    // An entry that moves to another file leaves its previous one behind, unless another entry still
    // points at it: nothing may stay on the device with nothing pointing at it.
    const previous = await this.locationOf(owner, document.id);
    if (previous !== undefined && previous !== location) {
      const released = await this.releaseContent(previous, owner, document.id);
      if (!released.ok) return released;
    }
    await database.run(SAVE, [
      owner,
      document.id,
      cachedAt,
      location,
      JSON.stringify(storedDocumentOf(document)),
    ]);
    return ok(undefined);
  }

  /** Drops an entry, and its file as far as it can: for an entry that must not be served any more. */
  private async forget(owner: UserId, id: DocumentId): Promise<Step<void>> {
    const location = await this.locationOf(owner, id);
    if (location === undefined) return ok(undefined);
    await this.releaseContent(location, owner, id);
    await this.options.database.run(REMOVE, [owner, id]);
    return ok(undefined);
  }

  private async removeEntry(owner: UserId, id: DocumentId): Promise<Step<void>> {
    const location = await this.locationOf(owner, id);
    if (location === undefined) return ok(undefined);

    const released = await this.releaseContent(location, owner, id);
    if (!released.ok) return released;
    await this.options.database.run(REMOVE, [owner, id]);
    return ok(undefined);
  }

  private async removeEverything(): Promise<Step<void>> {
    const { database, files } = this.options;
    const rows = await database.all(ALL_LOCATIONS);

    // The content first, every file that can be deleted: the entries of the ones that went follow,
    // those of the ones that did not stay, so that the call can be repeated.
    let failure: FileStoreFailure | undefined;
    const deleted: string[] = [];
    for (const row of rows) {
      const location = String(row[COLUMN.Location]);
      const parsed = parseDocumentLocation(location);
      const result = parsed.ok ? await deleteContent(files, parsed.value) : ok(undefined);
      if (result.ok) deleted.push(location);
      else failure ??= result.error;
    }
    await database.transaction(async (tx) => {
      for (const location of deleted) await tx.run(REMOVE_AT, [location]);
    });
    if (failure !== undefined) return err(failure);

    await database.run(REMOVE_ALL);
    // What no entry points at goes too: purging leaves nothing of any document on the device.
    return files.deleteAll();
  }

  private async sweep(): Promise<Step<void>> {
    const { database, files, monitoring } = this.options;
    const listed = await files.list();
    if (!listed.ok) return listed;

    const referenced = new Set(
      (await database.all(ALL_LOCATIONS)).map((row) => {
        const parsed = parseDocumentLocation(String(row[COLUMN.Location]));
        return parsed.ok ? files.nameOf(parsed.value) : undefined;
      }),
    );
    let failure: FileStoreFailure | undefined;
    for (const name of listed.value) {
      if (referenced.has(name)) continue;
      const deleted = await files.delete(name);
      if (!deleted.ok) {
        monitoring.captureError(
          MONITORING_EVENT.OrphanFileNotDeleted,
          storageWriteFailed(deleted.error.cause),
          { [LOG_ATTRIBUTE.Resource]: RESOURCE },
        );
        failure ??= deleted.error;
      }
    }
    return failure === undefined ? ok(undefined) : err(failure);
  }

  /** The location an entry points at, or `undefined` when there is no entry. */
  private async locationOf(owner: UserId, id: DocumentId): Promise<string | undefined> {
    const [row] = await this.options.database.all(LOCATION_OF, [owner, id]);
    const location = row?.[COLUMN.Location];
    return typeof location === 'string' ? location : undefined;
  }

  /**
   * Deletes the file of the entry `(owner, id)`, unless another entry points at it. A location that
   * is no file of the store has nothing to delete.
   */
  private async releaseContent(
    location: string,
    owner: UserId,
    id: DocumentId,
  ): Promise<Step<void>> {
    const [row] = await this.options.database.all(OTHERS_AT, [location, owner, id]);
    if (Number(row?.others ?? 0) > 0) return ok(undefined);

    const parsed = parseDocumentLocation(location);
    return parsed.ok ? deleteContent(this.options.files, parsed.value) : ok(undefined);
  }

  private async lookup(
    owner: UserId,
    id: DocumentId,
  ): Promise<Step<CacheEntry<ViewableDocument> | undefined>> {
    const { database, files } = this.options;
    const [row] = await database.all(READ, [owner, id]);
    if (row === undefined) return ok(undefined);

    const decoded = this.decode(row);
    if (!decoded.ok) {
      await this.discard(owner, id, row, decoded.issuePaths);
      return ok(undefined);
    }

    const present = await contentExists(files, decoded.value.viewable.location);
    if (!present.ok) return present;
    if (!present.value) {
      // The content is gone: the entry points at nothing. Dropped, unless a newer save has moved it.
      await this.bestEffort(() =>
        database.run(REMOVE_WHILE_AT, [owner, id, decoded.value.viewable.location]),
      );
      return ok(undefined);
    }
    return ok({ value: decoded.value.viewable, cachedAt: decoded.value.cachedAt });
  }

  /** A row read back: it is JSON of the shape stored, its values pass the domain, its file is one of the store. */
  private decode(row: SqlRow): Decoded {
    const payload = row[COLUMN.Payload];
    const cachedAt = parseInstant(Number(row[COLUMN.CachedAt]));
    const location = parseDocumentLocation(String(row[COLUMN.Location]));
    if (typeof payload !== 'string' || !cachedAt.ok || !location.ok) return { ok: false };
    if (this.options.files.nameOf(location.value) === undefined) return { ok: false };

    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return { ok: false };
    }
    const parsed = storedDocumentSchema.safeParse(json);
    if (!parsed.success) return { ok: false, issuePaths: issuePathsOf(parsed.error) };
    const document = documentOf(parsed.data);
    return document.ok
      ? {
          ok: true,
          value: {
            viewable: { document: document.value, location: location.value },
            cachedAt: cachedAt.value,
          },
        }
      : { ok: false };
  }

  /** Reports a row that cannot be read, and removes it with its file. Best effort: it is a miss either way. */
  private async discard(
    owner: UserId,
    id: DocumentId,
    row: SqlRow,
    issuePaths: string | undefined,
  ): Promise<void> {
    const attributes: LogAttributes = {
      [LOG_ATTRIBUTE.Resource]: RESOURCE,
      ...(issuePaths === undefined ? {} : { [LOG_ATTRIBUTE.IssuePaths]: issuePaths }),
    };
    this.options.monitoring.captureError(
      MONITORING_EVENT.StoredRowDiscarded,
      storageReadFailed(UNREADABLE_CAUSE),
      attributes,
    );
    await this.bestEffort(async () => {
      await this.releaseContent(String(row[COLUMN.Location]), owner, id);
      await this.options.database.run(REMOVE, [owner, id]);
    });
  }

  private async bestEffort(work: () => Promise<unknown>): Promise<void> {
    await attempt(work, this.timeout());
  }
}

type Decoded =
  | {
      readonly ok: true;
      readonly value: { readonly viewable: ViewableDocument; readonly cachedAt: Instant };
    }
  | { readonly ok: false; readonly issuePaths?: string };
