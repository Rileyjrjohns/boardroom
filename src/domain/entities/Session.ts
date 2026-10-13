import type { Instant } from '../value-objects/Instant';

import type { User } from './User';

/**
 * A signed-in user and the instant their session ends. Holds no secret: the tokens belong to the
 * adapter that implements `AuthSession`.
 *
 * `expiresAt` is on the device clock, the same time base as the `Clock` port: the adapter computes
 * it at sign-in as `clock.now()` plus the lifetime the server grants, and never copies a timestamp
 * of the server. It is therefore only as reliable as the device clock: a clock set back extends the
 * session locally, a clock set forward ends it early. The server enforces its own expiry on every
 * call, so the local value only decides when the app stops offering the session.
 */
export interface Session {
  readonly user: User;
  readonly expiresAt: Instant;
}

export function createSession(input: {
  readonly user: User;
  readonly expiresAt: Instant;
}): Session {
  return { user: input.user, expiresAt: input.expiresAt };
}
