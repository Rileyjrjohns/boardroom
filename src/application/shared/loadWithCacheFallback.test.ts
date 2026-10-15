import { appLocked, notAuthenticated, sessionChanged } from '@domain/errors/AuthenticationError';
import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from '@domain/errors/RepositoryError';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import {
  NOW,
  aDocument,
  aDocumentLocation,
  aDuration,
  aMeeting,
  aSession,
  aUser,
  aUserId,
  at,
} from '@domain/testing/builders';
import type { Instant } from '@domain/value-objects/Instant';

import type { CacheEntry } from '../ports/CacheEntry';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../ports/Monitoring';
import { createFakes } from '../testing/createFakes';

import { FRESHNESS } from './Loaded';
import { CACHE_RESOURCE } from './CacheResource';
import { loadWithCacheFallback } from './loadWithCacheFallback';
import type { CacheFallbackSource } from './loadWithCacheFallback';

const REMOTE = 'remote value';
const MAX_AGE = 3_600_000;
const CACHED: CacheEntry<string> = { value: 'cached value', cachedAt: at(-60_000) };
const LOG_ATTRIBUTES = {
  [LOG_ATTRIBUTE.MeetingId]: 'meeting-1',
  [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting,
};

/** A source whose operations are scripted and counted. */
function scriptedSource(script: {
  fetch: ReturnType<CacheFallbackSource<string, RepositoryError>['fetch']>;
  read?: ReturnType<CacheFallbackSource<string, RepositoryError>['read']>;
  save?: ReturnType<CacheFallbackSource<string, RepositoryError>['save']>;
  remove?: ReturnType<CacheFallbackSource<string, RepositoryError>['remove']>;
  revoke?: ReturnType<CacheFallbackSource<string, RepositoryError>['revoke']>;
}) {
  const saved: { value: string; cachedAt: Instant }[] = [];
  let reads = 0;
  let removals = 0;
  let revocations = 0;
  const source: CacheFallbackSource<string, RepositoryError> = {
    resource: CACHE_RESOURCE.Meeting,
    attributes: { [LOG_ATTRIBUTE.MeetingId]: 'meeting-1' },
    fetch: () => script.fetch,
    save: (value, cachedAt) => {
      saved.push({ value, cachedAt });
      return script.save ?? Promise.resolve(ok(undefined));
    },
    read: () => {
      reads += 1;
      return script.read ?? Promise.resolve(ok(undefined));
    },
    remove: () => {
      removals += 1;
      return script.remove ?? Promise.resolve(ok(undefined));
    },
    revoke: () => {
      revocations += 1;
      return script.revoke ?? Promise.resolve(ok(undefined));
    },
  };
  return {
    source,
    saved,
    reads: () => reads,
    removals: () => removals,
    revocations: () => revocations,
  };
}

const OWNER = aUserId();

/** The fakes of the ports as the deps of the policy, with the maximum age of the tests. */
function setup() {
  return { ...createFakes(), maxCacheAge: aDuration(MAX_AGE) };
}

describe('loadWithCacheFallback', () => {
  describe('when the remote source answers', () => {
    it('returns the data fresh and writes it through to the cache with the instant of the clock', async () => {
      const deps = setup();
      const { source, saved } = scriptedSource({ fetch: Promise.resolve(ok(REMOTE)) });

      const result = await loadWithCacheFallback(deps, OWNER, source);

      expect(result).toEqual(
        ok({ data: REMOTE, source: { freshness: FRESHNESS.Fresh }, loadedAt: NOW }),
      );
      expect(saved).toEqual([{ value: REMOTE, cachedAt: NOW }]);
      expect(deps.monitoring.errors).toEqual([]);
    });

    it('stamps the data with the instant of the clock when it answers, not when it was asked', async () => {
      const deps = setup();
      const { source, saved } = scriptedSource({ fetch: Promise.resolve(ok(REMOTE)) });
      const slow = {
        ...source,
        fetch: async () => {
          deps.clock.advance(5000);
          return ok(REMOTE);
        },
      };

      const result = await loadWithCacheFallback(deps, OWNER, slow);

      expect(result.ok && result.value.loadedAt).toBe(at(5000));
      expect(saved).toEqual([{ value: REMOTE, cachedAt: at(5000) }]);
    });

    it('does not read nor remove anything in the cache', async () => {
      const { source, reads, removals } = scriptedSource({ fetch: Promise.resolve(ok(REMOTE)) });

      await loadWithCacheFallback(setup(), OWNER, source);

      expect(reads()).toBe(0);
      expect(removals()).toBe(0);
    });

    it('still returns the fresh data when the cache cannot be written, and captures the failure', async () => {
      const deps = setup();
      const failure = storageWriteFailed('disk full');
      const { source } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)),
        save: Promise.resolve(err(failure)),
      });

      const result = await loadWithCacheFallback(deps, OWNER, source);

      expect(result).toEqual(
        ok({ data: REMOTE, source: { freshness: FRESHNESS.Fresh }, loadedAt: NOW }),
      );
      expect(deps.monitoring.errors).toEqual([
        { event: MONITORING_EVENT.CacheWriteFailed, error: failure, attributes: LOG_ATTRIBUTES },
      ]);
    });
  });

  describe('when the network is unavailable', () => {
    it('serves the cached value flagged stale, with the instant it was cached', async () => {
      const deps = setup();
      const { source, saved } = scriptedSource({
        fetch: Promise.resolve(err(networkUnavailable())),
        read: Promise.resolve(ok(CACHED)),
      });

      const result = await loadWithCacheFallback(deps, OWNER, source);

      expect(result).toEqual(
        ok({
          data: CACHED.value,
          source: { freshness: FRESHNESS.Stale, cachedAt: CACHED.cachedAt },
          loadedAt: NOW,
        }),
      );
      expect(saved).toEqual([]);
      expect(deps.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Info,
          event: MONITORING_EVENT.ServedFromCache,
          attributes: LOG_ATTRIBUTES,
        },
      ]);
    });

    it('returns the network error on a cache miss', async () => {
      const { source } = scriptedSource({ fetch: Promise.resolve(err(networkUnavailable())) });

      expect(await loadWithCacheFallback(setup(), OWNER, source)).toEqual(
        err(networkUnavailable()),
      );
    });

    it('returns the network error, and captures the failure, when the cache cannot be read', async () => {
      const deps = setup();
      const failure = storageReadFailed('corrupt');
      const { source } = scriptedSource({
        fetch: Promise.resolve(err(networkUnavailable())),
        read: Promise.resolve(err(failure)),
      });

      const result = await loadWithCacheFallback(deps, OWNER, source);

      expect(result).toEqual(err(networkUnavailable()));
      expect(deps.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CacheReadFailed]);
      expect(deps.monitoring.errors[0]?.error).toBe(failure);
    });

    describe('the age of the cached value', () => {
      const offlineWith = (cachedAt: Instant) =>
        scriptedSource({
          fetch: Promise.resolve(err(networkUnavailable())),
          read: Promise.resolve(ok({ value: CACHED.value, cachedAt })),
        });

      it('is accepted up to the maximum age, included', async () => {
        const result = await loadWithCacheFallback(
          setup(),
          OWNER,
          offlineWith(at(-MAX_AGE)).source,
        );

        expect(result.ok && result.value.source).toEqual({
          freshness: FRESHNESS.Stale,
          cachedAt: at(-MAX_AGE),
        });
      });

      it('makes the value a miss once it is older than that, and says so', async () => {
        const deps = setup();

        const result = await loadWithCacheFallback(
          deps,
          OWNER,
          offlineWith(at(-MAX_AGE - 1)).source,
        );

        expect(result).toEqual(err(networkUnavailable()));
        expect(deps.monitoring.logs).toEqual([
          {
            level: LOG_LEVEL.Warn,
            event: MONITORING_EVENT.CacheEntryDiscarded,
            attributes: LOG_ATTRIBUTES,
          },
        ]);
      });

      it('makes a value dated in the future a miss, since the clock was set back', async () => {
        const result = await loadWithCacheFallback(setup(), OWNER, offlineWith(at(1)).source);

        expect(result).toEqual(err(networkUnavailable()));
      });

      it('stamps the saved data with the instant of the call, which is not the instant it was cached', async () => {
        const deps = setup();
        deps.clock.advance(120_000);
        const { source } = offlineWith(at(-60_000));

        const result = await loadWithCacheFallback(deps, OWNER, source);

        expect(result.ok && result.value.loadedAt).toBe(at(120_000));
        expect(result.ok && result.value.source).toEqual({
          freshness: FRESHNESS.Stale,
          cachedAt: at(-60_000),
        });
      });

      it('is measured with the clock at the moment of the call', async () => {
        const deps = setup();
        deps.auth.session = aSession({ expiresAt: at(2 * MAX_AGE) });
        const { source } = offlineWith(at(-60_000));
        expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(
          ok({
            data: CACHED.value,
            source: { freshness: FRESHNESS.Stale, cachedAt: at(-60_000) },
            loadedAt: NOW,
          }),
        );

        deps.clock.advance(MAX_AGE);

        expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(networkUnavailable()));
      });
    });
  });

  describe('when the remote source refuses the session (unauthorized)', () => {
    it('empties both caches for every owner, returns the error, and never reads the cache', async () => {
      const deps = setup();
      await deps.meetingCache.saveMeeting(OWNER, aMeeting(), NOW);
      await deps.meetingCache.saveMeeting(aUserId('user-2'), aMeeting(), NOW);
      await deps.documentCache.save(
        OWNER,
        { document: aDocument(), location: aDocumentLocation() },
        NOW,
      );
      const { source, reads, removals, revocations } = scriptedSource({
        fetch: Promise.resolve(err(unauthorized())),
        read: Promise.resolve(ok(CACHED)),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(unauthorized()));

      expect(deps.meetingCache.isEmpty()).toBe(true);
      expect(deps.documentCache.isEmpty()).toBe(true);
      expect(reads()).toBe(0);
      expect(removals() + revocations()).toBe(0);
    });

    it('ends the session on the device: the user is signed out and the app is locked', async () => {
      const deps = setup();
      const { source } = scriptedSource({ fetch: Promise.resolve(err(unauthorized())) });

      await loadWithCacheFallback(deps, OWNER, source);

      expect(deps.auth.signOutCalls).toBe(1);
      expect(deps.auth.session).toBeUndefined();
      expect(deps.appLock.isLocked()).toBe(true);
    });

    it('captures a session that cannot be forgotten, and returns the refusal all the same', async () => {
      const deps = setup();
      deps.auth.signOutFailure = storageWriteFailed();
      const { source } = scriptedSource({ fetch: Promise.resolve(err(unauthorized())) });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(unauthorized()));
      expect(deps.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.SignOutFailed]);
    });

    it('does not sign out somebody else, who signed in while the request was on its way', async () => {
      const deps = setup();
      const { source } = scriptedSource({
        fetch: Promise.resolve(err(unauthorized())).then((result) => {
          deps.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
          return result;
        }),
      });

      const result = await loadWithCacheFallback(deps, OWNER, source);

      expect(result).toEqual(err(sessionChanged()));
      expect(deps.auth.signOutCalls).toBe(0);
      expect(deps.auth.session).toBeDefined();
    });

    it('captures a purge that fails, and returns the error', async () => {
      const deps = setup();
      deps.meetingCache.purgeFailure = storageWriteFailed();
      const { source } = scriptedSource({ fetch: Promise.resolve(err(unauthorized())) });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(unauthorized()));
      expect(deps.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CachePurgeFailed]);
    });
  });

  describe.each([
    ['forbidden', forbidden()],
    ['not found', notFound()],
  ])('when the remote source refuses the item (%s)', (_name, error) => {
    it('revokes the entry and what hangs off it, and returns the error, never reading the cache', async () => {
      const deps = setup();
      await deps.meetingCache.saveMeeting(OWNER, aMeeting(), NOW);
      const { source, reads, removals, revocations } = scriptedSource({
        fetch: Promise.resolve(err(error)),
        read: Promise.resolve(ok(CACHED)),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(error));

      expect(revocations()).toBe(1);
      expect(removals()).toBe(0);
      expect(reads()).toBe(0);
      expect(deps.meetingCache.isEmpty()).toBe(false);
    });

    it('empties both caches, and captures the failure, when the entry cannot be revoked', async () => {
      const deps = setup();
      await deps.meetingCache.saveMeeting(OWNER, aMeeting(), NOW);
      await deps.documentCache.save(
        OWNER,
        { document: aDocument(), location: aDocumentLocation() },
        NOW,
      );
      const failure = storageWriteFailed();
      const { source } = scriptedSource({
        fetch: Promise.resolve(err(error)),
        revoke: Promise.resolve(err(failure)),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(error));

      expect(deps.monitoring.errors).toEqual([
        { event: MONITORING_EVENT.CacheRemoveFailed, error: failure, attributes: LOG_ATTRIBUTES },
      ]);
      expect(deps.meetingCache.isEmpty()).toBe(true);
      expect(deps.documentCache.isEmpty()).toBe(true);
    });

    it('captures the failure of the purge too when even that fails', async () => {
      const deps = setup();
      deps.documentCache.purgeFailure = storageWriteFailed();
      const { source } = scriptedSource({
        fetch: Promise.resolve(err(error)),
        revoke: Promise.resolve(err(storageWriteFailed())),
      });

      await loadWithCacheFallback(deps, OWNER, source);

      expect(deps.monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.CacheRemoveFailed,
        MONITORING_EVENT.CachePurgeFailed,
      ]);
    });
  });

  describe('when the cache cannot be written', () => {
    it('removes the entry, so that an older copy is not served afterwards as if it were current', async () => {
      const deps = setup();
      const { source, removals, revocations } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)),
        save: Promise.resolve(err(storageWriteFailed())),
      });

      await loadWithCacheFallback(deps, OWNER, source);

      expect(removals()).toBe(1);
      expect(revocations()).toBe(0);
    });

    it('empties both caches when the entry cannot be removed either', async () => {
      const deps = setup();
      await deps.meetingCache.saveMeeting(OWNER, aMeeting(), NOW);
      const { source } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)),
        save: Promise.resolve(err(storageWriteFailed())),
        remove: Promise.resolve(err(storageWriteFailed())),
      });

      const result = await loadWithCacheFallback(deps, OWNER, source);

      expect(result.ok).toBe(true);
      expect(deps.meetingCache.isEmpty()).toBe(true);
      expect(deps.monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.CacheWriteFailed,
        MONITORING_EVENT.CacheRemoveFailed,
      ]);
    });
  });

  describe('when the user is not the one the call was made for', () => {
    it('writes nothing and answers sessionChanged, after a slow call that spanned a sign-in', async () => {
      const deps = setup();
      const { source, saved } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)).then((result) => {
          deps.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
          return result;
        }),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(sessionChanged()));
      expect(saved).toEqual([]);
    });

    it('empties both caches when a fetch that succeeded ends after a sign-in, since it may have kept a file', async () => {
      const deps = setup();
      const { source } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)).then((result) => {
          deps.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
          return result;
        }),
      });

      await loadWithCacheFallback(deps, OWNER, source);

      expect(deps.meetingCache.purgeCalls).toBe(1);
      expect(deps.documentCache.purgeCalls).toBe(1);
    });

    it('empties both caches when a fetch that succeeded ends after a sign-out', async () => {
      const deps = setup();
      const { source, saved } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)).then((result) => {
          deps.auth.session = undefined;
          return result;
        }),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(notAuthenticated()));

      expect(saved).toEqual([]);
      expect(deps.meetingCache.purgeCalls).toBe(1);
      expect(deps.documentCache.purgeCalls).toBe(1);
    });

    it('captures a purge that fails and still answers the refusal of the session', async () => {
      const deps = setup();
      deps.documentCache.purgeFailure = storageWriteFailed('disk full');
      const { source } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)).then((result) => {
          deps.auth.session = undefined;
          return result;
        }),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(notAuthenticated()));
      expect(deps.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CachePurgeFailed]);
    });

    it('does not read the cache of the previous owner either, nor evict anything', async () => {
      const deps = setup();
      const { source, reads, removals, revocations } = scriptedSource({
        fetch: Promise.resolve(err(networkUnavailable())).then((result) => {
          deps.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
          return result;
        }),
        read: Promise.resolve(ok(CACHED)),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(sessionChanged()));
      expect(reads() + removals() + revocations()).toBe(0);
      // The remote call failed, so it kept nothing: the caches are left alone.
      expect(deps.meetingCache.purgeCalls + deps.documentCache.purgeCalls).toBe(0);
    });

    it('answers appLocked when the app was locked meanwhile, and writes nothing', async () => {
      const deps = setup();
      const { source, saved } = scriptedSource({
        fetch: Promise.resolve(ok(REMOTE)).then((result) => {
          deps.appLock.lock();
          return result;
        }),
      });

      expect(await loadWithCacheFallback(deps, OWNER, source)).toEqual(err(appLocked()));
      expect(saved).toEqual([]);
      // The user is the same and unlocks the app again: their cache is not theirs to lose.
      expect(deps.meetingCache.purgeCalls + deps.documentCache.purgeCalls).toBe(0);
    });
  });

  describe('when the remote source fails unexpectedly', () => {
    it('returns the error as is and leaves the cache alone', async () => {
      const error = unexpected('HTTP 500');
      const { source, reads, removals } = scriptedSource({
        fetch: Promise.resolve(err(error)),
        read: Promise.resolve(ok(CACHED)),
      });

      expect(await loadWithCacheFallback(setup(), OWNER, source)).toEqual(err(error));
      expect(reads()).toBe(0);
      expect(removals()).toBe(0);
    });
  });
});
