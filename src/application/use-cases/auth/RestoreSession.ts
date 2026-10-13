import type { StorageReadFailedError } from '@domain/errors/StorageError';
import { isSessionExpired } from '@domain/policies/sessionExpiry';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import type { AuthSession } from '../../ports/AuthSession';
import type { Clock } from '../../ports/Clock';
import type { DocumentCache } from '../../ports/DocumentCache';
import type { MeetingCache } from '../../ports/MeetingCache';
import { LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import type { Monitoring } from '../../ports/Monitoring';
import type { AppLock } from '../../shared/AppLock';
import { purgeCaches } from '../../shared/purgeCaches';

export interface RestoreSessionDeps {
  readonly auth: AuthSession;
  readonly clock: Clock;
  readonly meetingCache: MeetingCache;
  readonly documentCache: DocumentCache;
  readonly monitoring: Monitoring;
  /** The instance shared by every use case: see `AppLock`. */
  readonly appLock: AppLock;
}

export const SESSION_RESTORE = {
  /** Nobody is signed in: show the sign-in screen. */
  None: 'none',
  /** Somebody is signed in, but the app stays locked until they unlock it with the biometrics. */
  UnlockRequired: 'unlockRequired',
} as const;

/**
 * What a cold start found. A restored session always comes as `unlockRequired`: the app was
 * closed, so nothing says how long it has been away, and the biometric unlock is required every
 * time. The rule is part of the value, so that a screen cannot show the session without having
 * seen it. The presentation shows the lock screen and calls `UnlockApp`.
 *
 * The status is all it says. Who the user is (a name, an email) is not part of it: nothing is
 * disclosed before the unlock, and no screen can show it by mistake.
 */
export type RestoredSession =
  | { readonly status: typeof SESSION_RESTORE.None }
  | { readonly status: typeof SESSION_RESTORE.UnlockRequired };

/**
 * Finds out, on a cold start, whether somebody was signed in when the app was last used. The app
 * is locked first thing (see `AppLock`), and stays locked until `UnlockApp` succeeds: a session
 * that is restored gives no access to anything before the biometrics.
 *
 * Succeeds with `none` when nobody is signed in, and with `unlockRequired` when somebody is. A
 * stored session that has expired is ended: the caches are emptied, the user is signed out, and
 * the result is `none`. If emptying the caches or signing out fails, the failure is captured and
 * `none` is still returned: an expired session is refused everywhere anyway.
 *
 * On a device where the biometrics cannot be used (none enrolled, or removed since), `UnlockApp`
 * fails closed, every time: the app cannot be unlocked, and the only way forward is to sign out
 * and sign in again.
 */
export class RestoreSession {
  constructor(private readonly deps: RestoreSessionDeps) {}

  async execute(): Promise<Result<RestoredSession, StorageReadFailedError>> {
    const { auth, clock, monitoring, appLock } = this.deps;

    appLock.lock();
    const current = await auth.current();
    if (isErr(current)) return current;

    const session = current.value;
    if (session === undefined) return ok({ status: SESSION_RESTORE.None });
    if (!isSessionExpired(session, clock.now())) {
      return ok({ status: SESSION_RESTORE.UnlockRequired });
    }

    monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.SessionExpired);
    await purgeCaches(this.deps);
    const signedOut = await auth.signOut();
    if (isErr(signedOut)) monitoring.captureError(MONITORING_EVENT.SignOutFailed, signedOut.error);
    return ok({ status: SESSION_RESTORE.None });
  }
}
