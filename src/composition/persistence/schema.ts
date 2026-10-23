import {
  DOCUMENT_INDEX,
  DOCUMENT_TABLE,
} from '@features/documents/infrastructure/persistence/schema';
import { MEETING_TABLE } from '@features/meetings/infrastructure/persistence/schema';
import { VOTE_INDEX, VOTE_TABLE } from '@features/votes/infrastructure/persistence/schema';

// The schema of the database of the whole app, as the last version of its history
// (`migrations.ts`) leaves it. Each feature owns the names of its tables, columns and indexes
// (`schema.ts` of its `infrastructure/persistence` folder) and its adapter reads and writes only
// those; this is the one place that lists them all, so that one file holds them all and a table that
// is added to the history without being added here, or the other way round, is found by a test.

/**
 * The tables and the indexes of the file, by feature. `VOTE_TABLE.OutboxRebuilt` is not here: it
 * exists during version 3 of the schema only.
 */
export const SCHEMA = {
  tables: {
    meetings: [MEETING_TABLE.Pages, MEETING_TABLE.Details],
    documents: [DOCUMENT_TABLE.Entries],
    votes: [VOTE_TABLE.Outbox],
  },
  indexes: {
    meetings: [],
    documents: [DOCUMENT_INDEX.EntriesByLocation],
    votes: [VOTE_INDEX.OutboxByResolution],
  },
} as const;

/** Every table of the file, every feature's together. */
export const SCHEMA_TABLES: readonly string[] = Object.values(SCHEMA.tables).flat();

/** Every index of the file, every feature's together. */
export const SCHEMA_INDEXES: readonly string[] = Object.values(SCHEMA.indexes).flat();
