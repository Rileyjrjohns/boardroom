import { z } from 'zod';

import { createSession } from '@domain/entities/Session';
import type { Session } from '@domain/entities/Session';
import { createUser } from '@domain/entities/User';
import type { ValidationError } from '@domain/errors/ValidationError';
import { andThen, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Credentials } from '@domain/value-objects/Credentials';
import { durationFromMillis } from '@domain/value-objects/Duration';
import { parseEmailAddress } from '@domain/value-objects/EmailAddress';
import { parseUserId } from '@domain/value-objects/ids';
import { plus } from '@domain/value-objects/Instant';
import type { Instant } from '@domain/value-objects/Instant';

import { BEARER_TOKEN_TYPE } from '../protocol';

// Signing in: `POST /auth/sign-in`.

const MILLIS_PER_SECOND = 1000;

const userSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
});

export const signInRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export const signInResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal(BEARER_TOKEN_TYPE),
  /** How long the token lasts, in seconds, from the moment it is issued. */
  expiresIn: z.number(),
  user: userSchema,
});

export type SignInRequestWire = z.input<typeof signInRequestSchema>;
export type SignInResponseWire = z.input<typeof signInResponseSchema>;

/** The token, which stays inside the adapter, and the session, which is all the app sees. */
export interface SignedIn {
  readonly token: string;
  readonly session: Session;
}

/**
 * The session the server granted. The expiry is computed on the clock of the device from the
 * lifetime the server grants (see `AuthSession`), never copied from a timestamp of the server.
 */
export function toSignedIn(
  wire: z.output<typeof signInResponseSchema>,
  now: Instant,
): Result<SignedIn, ValidationError> {
  return andThen(parseUserId(wire.user.id), (id) =>
    andThen(parseEmailAddress(wire.user.email), (email) =>
      andThen(createUser({ id, fullName: wire.user.fullName, email }), (user) =>
        andThen(durationFromMillis(wire.expiresIn * MILLIS_PER_SECOND), (lifetime) =>
          andThen(plus(now, lifetime), (expiresAt) =>
            ok({ token: wire.accessToken, session: createSession({ user, expiresAt }) }),
          ),
        ),
      ),
    ),
  );
}

export function toSignInRequestWire(credentials: Credentials): SignInRequestWire {
  return { email: credentials.email, password: credentials.password };
}

export function toSignInResponseWire(
  signedIn: SignedIn,
  lifetimeSeconds: number,
): SignInResponseWire {
  const { user } = signedIn.session;
  return {
    accessToken: signedIn.token,
    tokenType: BEARER_TOKEN_TYPE,
    expiresIn: lifetimeSeconds,
    user: { id: user.id, fullName: user.fullName, email: user.email },
  };
}
