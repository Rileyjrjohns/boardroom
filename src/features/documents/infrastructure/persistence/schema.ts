// The names of what the documents store on the device. They are part of the format of the
// database: a database created by an older version of the app has these names in it. Changing one
// is a migration (see `src/composition/persistence/migrations.ts`, which lists the history of the
// whole file and reads these names), never an edit of a constant.

/** The tables of the documents. */
export const DOCUMENT_TABLE = {
  /** The documents already viewed, with where their content is. Added by version 4 of the schema. */
  Entries: 'document_entries',
} as const;

/** The columns of the tables of the documents. */
export const DOCUMENT_COLUMN = {
  /** The user whose session fetched a cached entry. */
  Owner: 'owner',
  DocumentId: 'document_id',
  /** Where the content of a cached document is: the location the repository handed out. */
  Location: 'location',
  CachedAt: 'cached_at',
  /** The metadata of the document as the cache writes it, as JSON. */
  Payload: 'payload',
} as const;

/** The indexes of the tables of the documents. */
export const DOCUMENT_INDEX = {
  /** Finds the entries that point at a file, to know whether another one still needs it. */
  EntriesByLocation: 'document_entries_by_location',
} as const;
