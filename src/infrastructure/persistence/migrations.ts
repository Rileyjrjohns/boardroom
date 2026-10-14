import { OUTBOX_STATUS } from '@domain/entities/OutboxVote';

import { COLUMN, INDEX, OUTBOX_QUARANTINED, TABLE } from './schema';

/**
 * A step from one version of the schema to the next. Versions are 1, 2, 3, ... with no gap. The
 * statements run in one transaction together with the update of the version, so that a migration
 * that fails leaves the database at the version it was at.
 *
 * Forward only: a migration that was released is never edited, a change is a new migration, and
 * there is no way back. A database that is more recent than the app (the app was downgraded) is
 * refused, not touched (see `runMigrations`).
 */
export interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

const pending = `'${OUTBOX_STATUS.Pending}'`;
const rejected = `'${OUTBOX_STATUS.Rejected}'`;
const quarantined = `'${OUTBOX_QUARANTINED}'`;

/**
 * Version 1: the cache of meetings and the outbox of votes.
 *
 * The cache keeps what it is given as the API writes it (JSON). Its key is made of one column for
 * each part (the owner, the period, the cursor, the size of the page, the id of the meeting), never
 * of the parts joined in one text, so that two different keys can never be the same row, whatever
 * characters the owner or the id contain. The outbox holds a vote in columns, in the order it was
 * enqueued: `sequence` only grows, and a row that is deleted never gives its number back.
 */
const initial: Migration = {
  version: 1,
  statements: [
    `CREATE TABLE ${TABLE.MeetingPages} (
      ${COLUMN.Owner} TEXT NOT NULL,
      ${COLUMN.Period} TEXT NOT NULL,
      ${COLUMN.CursorKey} TEXT NOT NULL,
      ${COLUMN.PageLimit} INTEGER NOT NULL,
      ${COLUMN.CachedAt} INTEGER NOT NULL,
      ${COLUMN.Payload} TEXT NOT NULL,
      PRIMARY KEY (${COLUMN.Owner}, ${COLUMN.Period}, ${COLUMN.CursorKey}, ${COLUMN.PageLimit})
    ) WITHOUT ROWID`,
    `CREATE TABLE ${TABLE.MeetingDetails} (
      ${COLUMN.Owner} TEXT NOT NULL,
      ${COLUMN.MeetingId} TEXT NOT NULL,
      ${COLUMN.CachedAt} INTEGER NOT NULL,
      ${COLUMN.Payload} TEXT NOT NULL,
      PRIMARY KEY (${COLUMN.Owner}, ${COLUMN.MeetingId})
    ) WITHOUT ROWID`,
    `CREATE TABLE ${TABLE.OutboxVotes} (
      ${COLUMN.Sequence} INTEGER PRIMARY KEY AUTOINCREMENT,
      ${COLUMN.IdempotencyKey} TEXT NOT NULL UNIQUE,
      ${COLUMN.VoterId} TEXT NOT NULL,
      ${COLUMN.ResolutionId} TEXT NOT NULL,
      ${COLUMN.MeetingId} TEXT NOT NULL,
      ${COLUMN.Choice} TEXT NOT NULL,
      ${COLUMN.CastAt} INTEGER NOT NULL,
      ${COLUMN.EnqueuedAt} INTEGER NOT NULL,
      ${COLUMN.Attempts} INTEGER NOT NULL,
      ${COLUMN.Status} TEXT NOT NULL CHECK (${COLUMN.Status} IN (${pending}, ${rejected})),
      ${COLUMN.RejectionReason} TEXT,
      ${COLUMN.RejectedAt} INTEGER,
      CHECK ((${COLUMN.Status} = ${pending}) = (${COLUMN.RejectionReason} IS NULL)),
      CHECK ((${COLUMN.Status} = ${pending}) = (${COLUMN.RejectedAt} IS NULL))
    )`,
  ],
};

/**
 * Version 2: finds the votes of a voter on a resolution without reading the whole outbox. Version 1
 * answers `findByResolution` with a scan, which is fine for the first votes and not for a board
 * that votes for years without acknowledging the rejected ones. It is a migration of its own from
 * the start, so that the path from an older database to the latest one exists, and is tested, before
 * the first change of the schema that cannot wait.
 */
const indexOutboxByResolution: Migration = {
  version: 2,
  statements: [
    `CREATE INDEX ${INDEX.OutboxByResolution}
      ON ${TABLE.OutboxVotes} (${COLUMN.VoterId}, ${COLUMN.ResolutionId})`,
  ],
};

/**
 * Version 3: an entry of the outbox that no longer reads back as a vote can be kept, as it is, out
 * of the queue (status `quarantined`), instead of being deleted. SQLite cannot change a `CHECK`, so
 * the table is made again, with the same columns:
 *
 * - the status admits `quarantined`, and only for that status are the reason and the instant of a
 *   rejection not constrained (what is in an entry that cannot be read is whatever it is);
 * - the rows are copied with their `sequence`, and the high-water mark of the sequence is carried
 *   over, so that a number that was given to a vote and then freed is still never given again;
 * - the index of version 2 is created again, since dropping the table dropped it.
 *
 * Every vote of an existing database is a row of the new table, as it was.
 */
const quarantineUnreadableVotes: Migration = {
  version: 3,
  statements: [
    `CREATE TABLE ${TABLE.OutboxVotesRebuilt} (
      ${COLUMN.Sequence} INTEGER PRIMARY KEY AUTOINCREMENT,
      ${COLUMN.IdempotencyKey} TEXT NOT NULL UNIQUE,
      ${COLUMN.VoterId} TEXT NOT NULL,
      ${COLUMN.ResolutionId} TEXT NOT NULL,
      ${COLUMN.MeetingId} TEXT NOT NULL,
      ${COLUMN.Choice} TEXT NOT NULL,
      ${COLUMN.CastAt} INTEGER NOT NULL,
      ${COLUMN.EnqueuedAt} INTEGER NOT NULL,
      ${COLUMN.Attempts} INTEGER NOT NULL,
      ${COLUMN.Status} TEXT NOT NULL
        CHECK (${COLUMN.Status} IN (${pending}, ${rejected}, ${quarantined})),
      ${COLUMN.RejectionReason} TEXT,
      ${COLUMN.RejectedAt} INTEGER,
      CHECK (${COLUMN.Status} = ${quarantined}
        OR ((${COLUMN.Status} = ${pending}) = (${COLUMN.RejectionReason} IS NULL))),
      CHECK (${COLUMN.Status} = ${quarantined}
        OR ((${COLUMN.Status} = ${pending}) = (${COLUMN.RejectedAt} IS NULL)))
    )`,
    `INSERT INTO ${TABLE.OutboxVotesRebuilt}
      (${COLUMN.Sequence}, ${COLUMN.IdempotencyKey}, ${COLUMN.VoterId}, ${COLUMN.ResolutionId},
       ${COLUMN.MeetingId}, ${COLUMN.Choice}, ${COLUMN.CastAt}, ${COLUMN.EnqueuedAt},
       ${COLUMN.Attempts}, ${COLUMN.Status}, ${COLUMN.RejectionReason}, ${COLUMN.RejectedAt})
      SELECT ${COLUMN.Sequence}, ${COLUMN.IdempotencyKey}, ${COLUMN.VoterId}, ${COLUMN.ResolutionId},
       ${COLUMN.MeetingId}, ${COLUMN.Choice}, ${COLUMN.CastAt}, ${COLUMN.EnqueuedAt},
       ${COLUMN.Attempts}, ${COLUMN.Status}, ${COLUMN.RejectionReason}, ${COLUMN.RejectedAt}
      FROM ${TABLE.OutboxVotes}`,
    `DELETE FROM sqlite_sequence WHERE name = '${TABLE.OutboxVotesRebuilt}'`,
    `INSERT INTO sqlite_sequence (name, seq)
      SELECT '${TABLE.OutboxVotesRebuilt}', seq FROM sqlite_sequence
      WHERE name = '${TABLE.OutboxVotes}'`,
    `DROP TABLE ${TABLE.OutboxVotes}`,
    `ALTER TABLE ${TABLE.OutboxVotesRebuilt} RENAME TO ${TABLE.OutboxVotes}`,
    `CREATE INDEX ${INDEX.OutboxByResolution}
      ON ${TABLE.OutboxVotes} (${COLUMN.VoterId}, ${COLUMN.ResolutionId})`,
  ],
};

/**
 * Version 4: the cache of the documents already viewed. An entry is the metadata of a document and
 * where its content is (a file, kept apart from the database), for one owner.
 *
 * - The key is one column for each part, `(owner, document_id)`, never the two joined in a text, as
 *   in the cache of meetings.
 * - The location is a column of its own and not a part of the payload, because the cache has to
 *   ask the database which entries point at a file: the file of an entry is deleted only when no
 *   other entry (another owner's) needs it. The index answers that without reading every row.
 * - The payload is the document as the cache stores it, in the format of the cache (see
 *   `storedDocument.ts`).
 */
const cacheDocuments: Migration = {
  version: 4,
  statements: [
    `CREATE TABLE ${TABLE.DocumentEntries} (
      ${COLUMN.Owner} TEXT NOT NULL,
      ${COLUMN.DocumentId} TEXT NOT NULL,
      ${COLUMN.CachedAt} INTEGER NOT NULL,
      ${COLUMN.Location} TEXT NOT NULL,
      ${COLUMN.Payload} TEXT NOT NULL,
      PRIMARY KEY (${COLUMN.Owner}, ${COLUMN.DocumentId})
    ) WITHOUT ROWID`,
    `CREATE INDEX ${INDEX.DocumentEntriesByLocation}
      ON ${TABLE.DocumentEntries} (${COLUMN.Location})`,
  ],
};

/** Every migration of the database, in order. The last one is the version the app expects. */
export const MIGRATIONS: readonly Migration[] = [
  initial,
  indexOutboxByResolution,
  quarantineUnreadableVotes,
  cacheDocuments,
];
