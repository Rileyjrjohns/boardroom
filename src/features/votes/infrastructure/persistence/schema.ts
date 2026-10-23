// The names of what the votes store on the device. They are part of the format of the database: a
// database created by an older version of the app has these names in it. Changing one is a
// migration (see `src/composition/persistence/migrations.ts`, which lists the history of the whole
// file and reads these names), never an edit of a constant.

/** The tables of the votes. */
export const VOTE_TABLE = {
  /** The votes waiting to be sent, and the ones that were rejected. */
  Outbox: 'outbox_votes',
  /** Exists during version 3 of the schema only: the outbox, rebuilt (see `migrations.ts`). */
  OutboxRebuilt: 'outbox_votes_v3',
} as const;

/** The columns of the tables of the votes. */
export const VOTE_COLUMN = {
  /** The order of enqueueing: never reused, and the order the outbox is read in. */
  Sequence: 'sequence',
  IdempotencyKey: 'idempotency_key',
  VoterId: 'voter_id',
  ResolutionId: 'resolution_id',
  MeetingId: 'meeting_id',
  Choice: 'choice',
  CastAt: 'cast_at',
  EnqueuedAt: 'enqueued_at',
  Attempts: 'attempts',
  Status: 'status',
  /** Why a vote was rejected, as JSON. Null while it is pending. */
  RejectionReason: 'rejection_reason',
  RejectedAt: 'rejected_at',
} as const;

/** The indexes of the tables of the votes. */
export const VOTE_INDEX = {
  /** Finds the votes of a voter on a resolution. */
  OutboxByResolution: 'outbox_votes_by_voter_and_resolution',
} as const;

/**
 * The status of an entry of the outbox that no longer reads back as a vote, kept as it is. It is a
 * status of the table only: the domain knows a vote as pending or rejected. Added by version 3 of
 * the schema (see `migrations.ts`).
 */
export const OUTBOX_QUARANTINED = 'quarantined';
