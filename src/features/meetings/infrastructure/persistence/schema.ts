// The names of what the meetings store on the device. They are part of the format of the database:
// a database created by an older version of the app has these names in it. Changing one is a
// migration (see `src/composition/persistence/migrations.ts`, which lists the history of the whole
// file and reads these names), never an edit of a constant.

/** The tables of the meetings. */
export const MEETING_TABLE = {
  /** The pages of the list of meetings. */
  Pages: 'meeting_pages',
  /** The meetings viewed. */
  Details: 'meeting_details',
} as const;

/** The columns of the tables of the meetings. */
export const MEETING_COLUMN = {
  /** The user whose session fetched a cached entry. */
  Owner: 'owner',
  Period: 'period',
  /** The cursor of a cached page, written as JSON: `null` for the first page. */
  CursorKey: 'cursor_key',
  PageLimit: 'page_limit',
  MeetingId: 'meeting_id',
  CachedAt: 'cached_at',
  /** The page or the meeting as the API writes it, as JSON. */
  Payload: 'payload',
} as const;
