import {
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from '@domain/errors/RepositoryError';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import { NOW, aDuration, at } from '@domain/testing/builders';
import type { Instant } from '@domain/value-objects/Instant';

import type { CacheEntry } from '../ports/CacheEntry';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../ports/Monitoring';
import { FakeClock } from '../testing/FakeClock';
import { FakeMonitoring } from '../testing/FakeMonitoring';

import { FRESHNESS } from './Loaded';
import { CACHE_RESOURCE, loadWithCacheFallback } from './loadWithCacheFallback';
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
}) {
  const saved: { value: string; cachedAt: Instant }[] = [];
  let reads = 0;
  let removals = 0;
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
  };
  return { source, saved, reads: () => reads, removals: () => removals };
}

function setup() {
  return {
    clock: new FakeClock(NOW),
    monitoring: new FakeMonitoring(),
    maxCacheAge: aDuration(MAX_AGE),
  };
}

describe('loadWithCacheFallback', () => {
  describe('when the remote source answers', () => {
    it('returns the data fresh and writes it through to the cache with the instant of the clock', async () => {
      const deps = setup();
      const { source, saved } = scriptedSource({ fetch: Promise.resolve(ok(REMOTE)) });

      const result = await loadWithCacheFallback(deps, source);

      expect(result).toEqual(ok({ data: REMOTE, source: { freshness: FRESHNESS.Fresh } }));
      expect(saved).toEqual([{ value: REMOTE, cachedAt: NOW }]);
      expect(deps.monitoring.errors).toEqual([]);
    });

    it('does not read nor remove anything in the cache', async () => {
      const { source, reads, removals } = scriptedSource({ fetch: Promise.resolve(ok(REMOTE)) });

      await loadWithCacheFallback(setup(), source);

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

      const result = await loadWithCacheFallback(deps, source);

      expect(result).toEqual(ok({ data: REMOTE, source: { freshness: FRESHNESS.Fresh } }));
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

      const result = await loadWithCacheFallback(deps, source);

      expect(result).toEqual(
        ok({
          data: CACHED.value,
          source: { freshness: FRESHNESS.Stale, cachedAt: CACHED.cachedAt },
        }),
      );
      expect(saved).toEqual([]);
      expect(deps.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Warn,
          event: MONITORING_EVENT.ServedFromCache,
          attributes: LOG_ATTRIBUTES,
        },
      ]);
    });

    it('returns the network error on a cache miss', async () => {
      const { source } = scriptedSource({ fetch: Promise.resolve(err(networkUnavailable())) });

      expect(await loadWithCacheFallback(setup(), source)).toEqual(err(networkUnavailable()));
    });

    it('returns the network error, and captures the failure, when the cache cannot be read', async () => {
      const deps = setup();
      const failure = storageReadFailed('corrupt');
      const { source } = scriptedSource({
        fetch: Promise.resolve(err(networkUnavailable())),
        read: Promise.resolve(err(failure)),
      });

      const result = await loadWithCacheFallback(deps, source);

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
        const result = await loadWithCacheFallback(setup(), offlineWith(at(-MAX_AGE)).source);

        expect(result.ok && result.value.source).toEqual({
          freshness: FRESHNESS.Stale,
          cachedAt: at(-MAX_AGE),
        });
      });

      it('makes the value a miss once it is older than that, and says so', async () => {
        const deps = setup();

        const result = await loadWithCacheFallback(deps, offlineWith(at(-MAX_AGE - 1)).source);

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
        const result = await loadWithCacheFallback(setup(), offlineWith(at(1)).source);

        expect(result).toEqual(err(networkUnavailable()));
      });

      it('is measured with the clock at the moment of the call', async () => {
        const deps = setup();
        const { source } = offlineWith(at(-60_000));
        expect(await loadWithCacheFallback(deps, source)).toEqual(
          ok({
            data: CACHED.value,
            source: { freshness: FRESHNESS.Stale, cachedAt: at(-60_000) },
          }),
        );

        deps.clock.advance(MAX_AGE);

        expect(await loadWithCacheFallback(deps, source)).toEqual(err(networkUnavailable()));
      });
    });
  });

  describe.each([
    ['unauthorized', unauthorized()],
    ['not found', notFound()],
  ])('when the remote source answers %s', (_name, error) => {
    it('evicts the cached entry and returns the error, never reading the cache', async () => {
      const { source, reads, removals } = scriptedSource({
        fetch: Promise.resolve(err(error)),
        read: Promise.resolve(ok(CACHED)),
      });

      expect(await loadWithCacheFallback(setup(), source)).toEqual(err(error));
      expect(removals()).toBe(1);
      expect(reads()).toBe(0);
    });

    it('returns the error, and captures the failure, when the entry cannot be evicted', async () => {
      const deps = setup();
      const failure = storageWriteFailed();
      const { source } = scriptedSource({
        fetch: Promise.resolve(err(error)),
        remove: Promise.resolve(err(failure)),
      });

      expect(await loadWithCacheFallback(deps, source)).toEqual(err(error));
      expect(deps.monitoring.errors).toEqual([
        { event: MONITORING_EVENT.CacheRemoveFailed, error: failure, attributes: LOG_ATTRIBUTES },
      ]);
    });
  });

  describe('when the remote source fails unexpectedly', () => {
    it('returns the error as is and leaves the cache alone', async () => {
      const error = unexpected('HTTP 500');
      const { source, reads, removals } = scriptedSource({
        fetch: Promise.resolve(err(error)),
        read: Promise.resolve(ok(CACHED)),
      });

      expect(await loadWithCacheFallback(setup(), source)).toEqual(err(error));
      expect(reads()).toBe(0);
      expect(removals()).toBe(0);
    });
  });
});
