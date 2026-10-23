import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import { isErr } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { UserId } from '@core/domain/value-objects/ids';

import type { AuthSession } from '../ports/AuthSession';
import type { AppLock } from './AppLock';
import { purgeCaches } from './purgeCaches';
import type { PurgeCachesDeps } from './purgeCaches';

export interface EndSessionDeps extends PurgeCachesDeps {
  readonly auth: AuthSession;
  /** The instance shared by every use case: see `AppLock`. */
  readonly appLock: AppLock;
}

/**
 * Ends the session on the device: the app is locked, both caches are emptied, and the session is
 * forgotten. It is what signing out is (see `SignOut`), and the part of it that a session the
 * server refused shares.
 */
export async function closeSession(
  deps: EndSessionDeps,
): Promise<Result<void, StorageWriteFailedError>> {
  deps.appLock.lock();
  await purgeCaches(deps);
  return deps.auth.signOut();
}

/**
 * The server said the token of `user` is no longer valid (`unauthorized`): the session is over,
 * whatever the user was doing, and the device must not go on as if it were not. So the session is
 * ended here, once, by the application layer that met the answer (the single place is this
 * function; the cache fallback, the vote and the synchronisation all call it): the app is locked,
 * the caches are emptied and the session is forgotten, so that a restart does not restore a
 * session the server refused and nothing is sent with it again. The votes in the outbox stay: they
 * wait for the user to come back.
 *
 * It never fails, since the caller has the refusal to report: a session that cannot be forgotten
 * is captured (`signOutFailed`) and the caller still gets `unauthorized`. The interface then sends
 * the user to the sign-in screen, and does not sign out a second time for this code.
 *
 * Only the session of `user` is ended. `unauthorized` is also what an adapter answers when the
 * token it holds is not the one of the user the request was made for (somebody signed in while it
 * was on its way): the session now open is another one, and it was not refused. Nothing is
 * touched then, and nothing is touched either when nobody is signed in any more.
 */
export async function endRefusedSession(deps: EndSessionDeps, user: UserId): Promise<void> {
  const current = await deps.auth.current();
  // A session that cannot be read cannot be told from the refused one: it is ended, like it.
  if (!isErr(current) && current.value?.user.id !== user) return;

  const closed = await closeSession(deps);
  if (isErr(closed)) {
    deps.monitoring.captureError(MONITORING_EVENT.SignOutFailed, closed.error, {
      [LOG_ATTRIBUTE.UserId]: user,
    });
  }
}
