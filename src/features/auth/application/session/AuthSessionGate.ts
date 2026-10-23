import type { SessionGate } from '@core/application/ports/SessionGate';
import type { SessionRefusal } from '@core/application/ports/types/SessionRefusal';
import { err, isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { UserId } from '@core/domain/value-objects/ids';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import type { SessionChangedError } from '@features/auth/domain/errors/AuthenticationError';

import { endRefusedSession } from './endSession';
import { purgeCaches } from './purgeCaches';
import { requireSameUser } from './requireSession';
import type { RequireSessionDeps, SessionRequiredError } from './requireSession';

/** What the gate refuses with: the failures of the session guard. */
export type SessionGateError = SessionRequiredError | SessionChangedError;

/**
 * The session gate of the offline policy, over the session guards of `auth`: the answers of
 * `requireSameUser` and `endRefusedSession`, in the terms of the core (a user id and a
 * `SessionRefusal`).
 */
export class AuthSessionGate implements SessionGate<SessionGateError> {
  constructor(private readonly deps: RequireSessionDeps) {}

  async requireSameUser(
    expected: UserId,
  ): Promise<Result<UserId, SessionRefusal<SessionGateError>>> {
    const session = await requireSameUser(this.deps, expected);
    if (isErr(session)) {
      return err({
        error: session.error,
        sessionKept: session.error.code === AUTHENTICATION_ERROR_CODE.AppLocked,
      });
    }
    return ok(session.value.user.id);
  }

  endRefusedSession(user: UserId): Promise<void> {
    return endRefusedSession(this.deps, user);
  }

  purgeSessionData(): Promise<void> {
    return purgeCaches(this.deps);
  }
}
