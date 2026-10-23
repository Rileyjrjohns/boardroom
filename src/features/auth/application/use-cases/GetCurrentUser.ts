import { isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { User } from '@features/auth/domain/entities/User';

import { requireSession } from '../session/requireSession';
import type { RequireSessionDeps, SessionRequiredError } from '../session/requireSession';

export type GetCurrentUserDeps = RequireSessionDeps;

export type GetCurrentUserError = SessionRequiredError;

/**
 * Who is signed in, for a screen that applies a rule to the user (may this user vote on that
 * resolution?). It goes through the session guard like every use case that serves the user, so
 * nothing is disclosed before the unlock: `RestoreSession` says that somebody is signed in and
 * nothing about who, and this answers `appLocked` until the biometrics succeed.
 */
export class GetCurrentUser {
  constructor(private readonly deps: GetCurrentUserDeps) {}

  async execute(): Promise<Result<User, GetCurrentUserError>> {
    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    return ok(session.value.user);
  }
}
