import { useCallback, useRef } from 'react';

import { isSessionEndingCode } from '@features/auth/application/session/sessionPolicy';
import { ACCESS, useAccessStoreApi } from '@features/auth/presentation/state/accessStore';
import { SYNC_OUTCOME } from '@features/votes/application/use-cases/SyncPendingVotes';

import { useRefreshQueries } from '../hooks/useRefreshQueries';
import { useVotesServices } from '../services/VotesServices';
import { useVoteSyncStoreApi } from '../state/voteSyncStore';

/**
 * The one place that decides when the votes waiting in the outbox are sent. It returns
 * `requestSync`, which the callers call when something happened that may allow it: the connection
 * came back (`useConnectivityStatus`), the app returned to the foreground (`useAppLifecycle`), the
 * user signed in or unlocked (an effect of `SessionController` on the state of access). The
 * application layer does not watch anything by itself; this is the trigger.
 *
 * - Never while the app is locked or nobody is signed in: the request is dropped (the unlock or the
 *   sign-in asks again), and the use case would refuse anyway.
 * - Never two runs at once from the interface: a request that comes while a run is under way is
 *   remembered and answered with one more run when it ends, so that a vote queued meanwhile, or a
 *   connection that came back meanwhile, is not forgotten. (The use case also refuses a second run
 *   on its own instance; this is what keeps the interface from asking.)
 * - A result is told only when something was sent or rejected, in the banner of the screen, added
 *   to what earlier runs told until the user dismisses it, and then the queries it changes are
 *   refreshed: the outbox and the meetings, whose resolutions carry the votes the server has
 *   recorded.
 * - A run that meets the end of the session (the server refused it, it expired, the app locked
 *   meanwhile) ends it for the whole app, exactly like a query would.
 * - A run answers for the access it started under (the epoch of the store): if the user left and
 *   somebody else came while it was under way, its answer is dropped, whatever it says, and the
 *   request that came meanwhile is answered with a run of its own.
 */
export function useVoteSync(): () => void {
  const { syncPendingVotes } = useVotesServices();
  const store = useAccessStoreApi();
  const summaries = useVoteSyncStoreApi();
  const refresh = useRefreshQueries();
  const running = useRef(false);
  const requestedAgain = useRef(false);

  const runOnce = useCallback(async () => {
    // The run belongs to the access it started under: if the user left meanwhile, and somebody else
    // came, what it found is neither theirs to read nor a reason to end their session.
    const epoch = store.getState().accessEpoch;
    const result = await syncPendingVotes.execute();
    if (store.getState().accessEpoch !== epoch) return;
    if (!result.ok) {
      if (isSessionEndingCode(result.error.code)) {
        store.getState().endSession(result.error.code, epoch);
      }
      return;
    }

    const report = result.value;
    if (report.outcome === SYNC_OUTCOME.AlreadyRunning) return;
    if (
      report.outcome === SYNC_OUTCOME.Interrupted &&
      isSessionEndingCode(report.interruptedBy.code)
    ) {
      store.getState().endSession(report.interruptedBy.code, epoch);
    }

    const synced = report.synced.length;
    const rejected = report.rejected.length;
    if (synced === 0 && rejected === 0) return;
    summaries.getState().showSyncSummary({ synced, rejected }, epoch);
    await Promise.all([refresh.pendingVotes(), refresh.meetings()]);
  }, [syncPendingVotes, store, summaries, refresh]);

  return useCallback(() => {
    if (store.getState().access !== ACCESS.Unlocked) return;
    if (running.current) {
      requestedAgain.current = true;
      return;
    }
    running.current = true;
    void (async () => {
      try {
        do {
          requestedAgain.current = false;
          await runOnce();
        } while (requestedAgain.current && store.getState().access === ACCESS.Unlocked);
      } finally {
        running.current = false;
      }
    })();
  }, [store, runOnce]);
}
