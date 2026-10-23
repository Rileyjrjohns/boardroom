import type { Migration } from '@core/infrastructure/persistence/migrate';
import {
  DOCUMENT_COLUMN,
  DOCUMENT_INDEX,
  DOCUMENT_TABLE,
} from '@features/documents/infrastructure/persistence/schema';
import {
  MEETING_COLUMN,
  MEETING_TABLE,
} from '@features/meetings/infrastructure/persistence/schema';
import { OUTBOX_STATUS } from '@features/votes/domain/entities/OutboxVote';
import {
  OUTBOX_QUARANTINED,
  VOTE_COLUMN,
  VOTE_INDEX,
  VOTE_TABLE,
} from '@features/votes/infrastructure/persistence/schema';

// The history of the file: the migrations of the database of the whole app, in order. Each feature
// owns its tables and their names (`schema.ts` of its `infrastructure/persistence` folder), and
// this list, which is the app's, reads them; the machinery that runs the list is `migrate.ts` of
// the core (a migration is `{ version, statements }`).
//
// Forward only: a migration that was released is never edited, a change is a new migration, and
// there is no way back. A database that is more recent than the app (the app was downgraded) is
// refused, not touched (see `runMigrations`).

/** The columns of the tables of the meetings, of the votes and of the documents. */
const M = MEETING_COLUMN;
const V = VOTE_COLUMN;
const D = DOCUMENT_COLUMN;

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
    `CREATE TABLE ${MEETING_TABLE.Pages} (
      ${M.Owner} TEXT NOT NULL,
      ${M.Period} TEXT NOT NULL,
      ${M.CursorKey} TEXT NOT NULL,
      ${M.PageLimit} INTEGER NOT NULL,
      ${M.CachedAt} INTEGER NOT NULL,
      ${M.Payload} TEXT NOT NULL,
      PRIMARY KEY (${M.Owner}, ${M.Period}, ${M.CursorKey}, ${M.PageLimit})
    ) WITHOUT ROWID`,
    `CREATE TABLE ${MEETING_TABLE.Details} (
      ${M.Owner} TEXT NOT NULL,
      ${M.MeetingId} TEXT NOT NULL,
      ${M.CachedAt} INTEGER NOT NULL,
      ${M.Payload} TEXT NOT NULL,
      PRIMARY KEY (${M.Owner}, ${M.MeetingId})
    ) WITHOUT ROWID`,
    `CREATE TABLE ${VOTE_TABLE.Outbox} (
      ${V.Sequence} INTEGER PRIMARY KEY AUTOINCREMENT,
      ${V.IdempotencyKey} TEXT NOT NULL UNIQUE,
      ${V.VoterId} TEXT NOT NULL,
      ${V.ResolutionId} TEXT NOT NULL,
      ${V.MeetingId} TEXT NOT NULL,
      ${V.Choice} TEXT NOT NULL,
      ${V.CastAt} INTEGER NOT NULL,
      ${V.EnqueuedAt} INTEGER NOT NULL,
      ${V.Attempts} INTEGER NOT NULL,
      ${V.Status} TEXT NOT NULL CHECK (${V.Status} IN (${pending}, ${rejected})),
      ${V.RejectionReason} TEXT,
      ${V.RejectedAt} INTEGER,
      CHECK ((${V.Status} = ${pending}) = (${V.RejectionReason} IS NULL)),
      CHECK ((${V.Status} = ${pending}) = (${V.RejectedAt} IS NULL))
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
    `CREATE INDEX ${VOTE_INDEX.OutboxByResolution}
      ON ${VOTE_TABLE.Outbox} (${V.VoterId}, ${V.ResolutionId})`,
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
    `CREATE TABLE ${VOTE_TABLE.OutboxRebuilt} (
      ${V.Sequence} INTEGER PRIMARY KEY AUTOINCREMENT,
      ${V.IdempotencyKey} TEXT NOT NULL UNIQUE,
      ${V.VoterId} TEXT NOT NULL,
      ${V.ResolutionId} TEXT NOT NULL,
      ${V.MeetingId} TEXT NOT NULL,
      ${V.Choice} TEXT NOT NULL,
      ${V.CastAt} INTEGER NOT NULL,
      ${V.EnqueuedAt} INTEGER NOT NULL,
      ${V.Attempts} INTEGER NOT NULL,
      ${V.Status} TEXT NOT NULL
        CHECK (${V.Status} IN (${pending}, ${rejected}, ${quarantined})),
      ${V.RejectionReason} TEXT,
      ${V.RejectedAt} INTEGER,
      CHECK (${V.Status} = ${quarantined}
        OR ((${V.Status} = ${pending}) = (${V.RejectionReason} IS NULL))),
      CHECK (${V.Status} = ${quarantined}
        OR ((${V.Status} = ${pending}) = (${V.RejectedAt} IS NULL)))
    )`,
    `INSERT INTO ${VOTE_TABLE.OutboxRebuilt}
      (${V.Sequence}, ${V.IdempotencyKey}, ${V.VoterId}, ${V.ResolutionId},
       ${V.MeetingId}, ${V.Choice}, ${V.CastAt}, ${V.EnqueuedAt},
       ${V.Attempts}, ${V.Status}, ${V.RejectionReason}, ${V.RejectedAt})
      SELECT ${V.Sequence}, ${V.IdempotencyKey}, ${V.VoterId}, ${V.ResolutionId},
       ${V.MeetingId}, ${V.Choice}, ${V.CastAt}, ${V.EnqueuedAt},
       ${V.Attempts}, ${V.Status}, ${V.RejectionReason}, ${V.RejectedAt}
      FROM ${VOTE_TABLE.Outbox}`,
    `DELETE FROM sqlite_sequence WHERE name = '${VOTE_TABLE.OutboxRebuilt}'`,
    `INSERT INTO sqlite_sequence (name, seq)
      SELECT '${VOTE_TABLE.OutboxRebuilt}', seq FROM sqlite_sequence
      WHERE name = '${VOTE_TABLE.Outbox}'`,
    `DROP TABLE ${VOTE_TABLE.Outbox}`,
    `ALTER TABLE ${VOTE_TABLE.OutboxRebuilt} RENAME TO ${VOTE_TABLE.Outbox}`,
    `CREATE INDEX ${VOTE_INDEX.OutboxByResolution}
      ON ${VOTE_TABLE.Outbox} (${V.VoterId}, ${V.ResolutionId})`,
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
    `CREATE TABLE ${DOCUMENT_TABLE.Entries} (
      ${D.Owner} TEXT NOT NULL,
      ${D.DocumentId} TEXT NOT NULL,
      ${D.CachedAt} INTEGER NOT NULL,
      ${D.Location} TEXT NOT NULL,
      ${D.Payload} TEXT NOT NULL,
      PRIMARY KEY (${D.Owner}, ${D.DocumentId})
    ) WITHOUT ROWID`,
    `CREATE INDEX ${DOCUMENT_INDEX.EntriesByLocation}
      ON ${DOCUMENT_TABLE.Entries} (${D.Location})`,
  ],
};

/** Every migration of the database, in order. The last one is the version the app expects. */
export const MIGRATIONS: readonly Migration[] = [
  initial,
  indexOutboxByResolution,
  quarantineUnreadableVotes,
  cacheDocuments,
];
