const SCOPE = 'session';

const KIND = {
  User: 'user',
} as const;

/**
 * The query keys of the session, built here and nowhere else, so that a key is never spelled
 * twice. The user is not in them: the query client is created per app instance and holds the data
 * of one session at a time, emptied when the session ends (see `createAppState`).
 */
export const sessionQueryKeys = {
  /** Who is signed in, once the app is unlocked. */
  user: () => [SCOPE, KIND.User] as const,
} as const;
