const SCOPE = 'votes';

const KIND = {
  Pending: 'pending',
} as const;

/**
 * The query keys of the votes, built here and nowhere else, so that a key is never spelled twice.
 * The user is not in them: the query client is created per app instance and holds the data of one
 * session at a time, emptied when the session ends (see `createAppState`).
 */
export const votesQueryKeys = {
  /** The outbox of the signed-in user: the votes waiting to be sent, and the rejected ones. */
  pending: () => [SCOPE, KIND.Pending] as const,
} as const;
