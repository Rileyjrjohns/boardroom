// The names of what is stored on the device. They are part of the format of the database: a
// database created by an older version of the app has these names in it. Changing one is a
// migration (see `migrations.ts`), never an edit of a constant.

export const TABLE = {
  MeetingPages: 'meeting_pages',
  MeetingDetails: 'meeting_details',
  OutboxVotes: 'outbox_votes',
} as const;

export const COLUMN = {
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
  /** The order of enqueueing: never reused, and the order the outbox is read in. */
  Sequence: 'sequence',
  IdempotencyKey: 'idempotency_key',
  VoterId: 'voter_id',
  ResolutionId: 'resolution_id',
  Choice: 'choice',
  CastAt: 'cast_at',
  EnqueuedAt: 'enqueued_at',
  Attempts: 'attempts',
  Status: 'status',
  /** Why a vote was rejected, as JSON. Null while it is pending. */
  RejectionReason: 'rejection_reason',
  RejectedAt: 'rejected_at',
} as const;

export const INDEX = {
  OutboxByResolution: 'outbox_votes_by_voter_and_resolution',
} as const;
