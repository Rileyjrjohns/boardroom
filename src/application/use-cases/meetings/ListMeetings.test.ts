import { notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import { networkUnavailable, unauthorized, unexpected } from '@domain/errors/RepositoryError';
import { storageWriteFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_DAY,
  NOW,
  aMeetingId,
  aMeetingSummary,
  aSession,
  aUser,
  aUserId,
  anEmail,
  at,
  unwrap,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { createPage } from '@domain/value-objects/Page';
import { parsePageCursor } from '@domain/value-objects/PageCursor';
import { createPageRequest } from '@domain/value-objects/PageRequest';

import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { FRESHNESS } from '../../shared/Loaded';
import { CACHE_RESOURCE } from '../../shared/CacheResource';
import { createFakes } from '../../testing/createFakes';

import { ListMeetings } from './ListMeetings';
import type { ListMeetingsInput } from './ListMeetings';

const UPCOMING = MEETING_PERIOD.Upcoming;
const PAST = MEETING_PERIOD.Past;

// Upcoming: soonest first is 1, 2, 3. Past: latest first is 4, 5.
const M1 = aMeetingSummary({ id: aMeetingId('meeting-1'), scheduledAt: at(MILLIS_PER_DAY) });
const M2 = aMeetingSummary({ id: aMeetingId('meeting-2'), scheduledAt: at(2 * MILLIS_PER_DAY) });
const M3 = aMeetingSummary({ id: aMeetingId('meeting-3'), scheduledAt: at(3 * MILLIS_PER_DAY) });
const M4 = aMeetingSummary({ id: aMeetingId('meeting-4'), scheduledAt: at(-MILLIS_PER_DAY) });
const M5 = aMeetingSummary({ id: aMeetingId('meeting-5'), scheduledAt: at(-2 * MILLIS_PER_DAY) });

const CURSOR = unwrap(parsePageCursor('meeting-2'));
const FIRST_PAGE = createPage([M1, M2], CURSOR);
const SECOND_PAGE = createPage([M3]);

/** The page of `limit` meetings after `cursor` (the first page when absent). */
function request(limit: number, cursor?: typeof CURSOR): ListMeetingsInput['request'] {
  return unwrap(createPageRequest(cursor === undefined ? { limit } : { limit, cursor }));
}

const FIRST: ListMeetingsInput = { period: UPCOMING, request: request(2) };
const SECOND: ListMeetingsInput = { period: UPCOMING, request: request(2, CURSOR) };
const PAST_PAGE: ListMeetingsInput = { period: PAST, request: request(2) };
const WIDE: ListMeetingsInput = { period: UPCOMING, request: request(3) };

function setup() {
  const fakes = createFakes();
  // Not in order: the server sorts them.
  fakes.meetings.setMeetings(UPCOMING, [M3, M1, M2]);
  fakes.meetings.setMeetings(PAST, [M5, M4]);
  return { fakes, useCase: new ListMeetings(fakes) };
}

/** User B signs in on the device. */
function signInAsB(fakes: ReturnType<typeof createFakes>) {
  fakes.auth.session = aSession({
    user: aUser({ id: aUserId('user-B'), email: anEmail('b@example.com') }),
  });
}

describe('ListMeetings', () => {
  describe('what the server serves', () => {
    it('returns the first page, flagged fresh, soonest meeting first for the upcoming ones', async () => {
      const { fakes, useCase } = setup();

      const result = await useCase.execute(FIRST);

      expect(result).toEqual(
        ok({ data: FIRST_PAGE, source: { freshness: FRESHNESS.Fresh }, loadedAt: NOW }),
      );
      expect(fakes.meetings.listCalls).toEqual([FIRST]);
    });

    it('follows the cursor to the next page', async () => {
      const { useCase } = setup();

      const result = await useCase.execute(SECOND);

      expect(result).toEqual(
        ok({ data: SECOND_PAGE, source: { freshness: FRESHNESS.Fresh }, loadedAt: NOW }),
      );
    });

    it('returns the past meetings latest first', async () => {
      const { useCase } = setup();

      const result = await useCase.execute(PAST_PAGE);

      expect(result.ok && result.value.data.items).toEqual([M4, M5]);
    });

    it('asks for the page size it is given', async () => {
      const { useCase } = setup();

      const result = await useCase.execute({ period: UPCOMING, request: request(1) });

      expect(result.ok && result.value.data).toEqual(
        createPage([M1], unwrap(parsePageCursor('meeting-1'))),
      );
    });
  });

  describe('the session', () => {
    it('is required: without one, nothing is read from the server nor from the cache', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(FIRST);
      fakes.auth.session = undefined;
      fakes.network.goOffline();

      expect(await useCase.execute(FIRST)).toEqual(err(notAuthenticated()));
      expect(fakes.meetings.listCalls).toHaveLength(1);
    });

    it('must not have expired', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ expiresAt: NOW });

      expect(await useCase.execute(FIRST)).toEqual(err(sessionExpired()));
      expect(fakes.meetings.listCalls).toEqual([]);
    });
  });

  describe('the cache', () => {
    it('is written through with every fresh page, for the signed-in user, stamped by the clock', async () => {
      const { fakes, useCase } = setup();
      fakes.clock.advance(1000);
      await useCase.execute(FIRST);

      const cached = await fakes.meetingCache.readPage(aUserId(), { period: UPCOMING, limit: 2 });

      expect(cached).toEqual(ok({ value: FIRST_PAGE, cachedAt: at(1000) }));
    });

    it('serves the cached page flagged stale, with its age, when there is no network', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(FIRST);
      fakes.network.goOffline();
      fakes.clock.advance(1_800_000);

      const result = await useCase.execute(FIRST);

      expect(result).toEqual(
        ok({
          data: FIRST_PAGE,
          source: { freshness: FRESHNESS.Stale, cachedAt: NOW },
          loadedAt: at(1_800_000),
        }),
      );
    });

    it('gives back the right page offline after several were fetched: one entry per period, cursor and page size', async () => {
      const { fakes, useCase } = setup();
      for (const input of [FIRST, SECOND, PAST_PAGE, WIDE]) await useCase.execute(input);
      fakes.network.goOffline();

      const offline = async (input: ListMeetingsInput) => {
        const result = await useCase.execute(input);
        return result.ok ? [result.value.source.freshness, result.value.data.items] : result.error;
      };

      expect(await offline(FIRST)).toEqual([FRESHNESS.Stale, [M1, M2]]);
      expect(await offline(SECOND)).toEqual([FRESHNESS.Stale, [M3]]);
      expect(await offline(PAST_PAGE)).toEqual([FRESHNESS.Stale, [M4, M5]]);
      expect(await offline(WIDE)).toEqual([FRESHNESS.Stale, [M1, M2, M3]]);
      expect(await offline({ period: UPCOMING, request: request(10) })).toEqual(
        networkUnavailable(),
      );
    });

    it('returns the network error when the page was never cached', async () => {
      const { fakes, useCase } = setup();
      fakes.network.goOffline();

      expect(await useCase.execute(FIRST)).toEqual(err(networkUnavailable()));
    });

    it('keeps the pages of each user apart: B finds nothing of what A saw, and does not overwrite it', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(FIRST);
      signInAsB(fakes);
      fakes.network.goOffline();
      expect(await useCase.execute(FIRST)).toEqual(err(networkUnavailable()));

      fakes.network.goOnline();
      fakes.clock.advance(60_000);
      await useCase.execute(FIRST);
      fakes.network.goOffline();
      const asB = await useCase.execute(FIRST);
      fakes.auth.session = aSession();
      const asA = await useCase.execute(FIRST);

      expect(asB.ok && asB.value.source).toEqual({
        freshness: FRESHNESS.Stale,
        cachedAt: at(60_000),
      });
      expect(asA.ok && asA.value.source).toEqual({ freshness: FRESHNESS.Stale, cachedAt: NOW });
    });

    it('refuses a page that is older than the maximum age', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ expiresAt: at(30 * MILLIS_PER_DAY) });
      await useCase.execute(FIRST);
      fakes.network.goOffline();

      fakes.clock.advance(7 * MILLIS_PER_DAY);
      const atTheLimit = await useCase.execute(FIRST);
      expect(atTheLimit.ok && atTheLimit.value.source).toEqual({
        freshness: FRESHNESS.Stale,
        cachedAt: NOW,
      });

      fakes.clock.advance(1);
      expect(await useCase.execute(FIRST)).toEqual(err(networkUnavailable()));
      expect(fakes.monitoring.logs.at(-1)).toEqual({
        level: LOG_LEVEL.Warn,
        event: MONITORING_EVENT.CacheEntryDiscarded,
        attributes: {
          [LOG_ATTRIBUTE.Period]: UPCOMING,
          [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.MeetingPage,
        },
      });
    });

    it('evicts the cached page when the server refuses, and does not serve it afterwards', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(FIRST);
      fakes.meetings.failure = unauthorized();

      expect(await useCase.execute(FIRST)).toEqual(err(unauthorized()));
      expect(await fakes.meetingCache.readPage(aUserId(), { period: UPCOMING, limit: 2 })).toEqual(
        ok(undefined),
      );

      fakes.meetings.failure = undefined;
      // The refused session is over: the user signs in again, and finds no saved copy.
      fakes.auth.session = aSession();
      fakes.appLock.unlock();
      fakes.network.goOffline();
      expect(await useCase.execute(FIRST)).toEqual(err(networkUnavailable()));
    });

    it('empties every cached page when the session is refused, not only the one that was asked for', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(FIRST);
      await useCase.execute(SECOND);
      fakes.meetings.failure = unauthorized();
      await useCase.execute(FIRST);

      expect(
        await fakes.meetingCache.readPage(aUserId(), {
          period: UPCOMING,
          cursor: CURSOR,
          limit: 2,
        }),
      ).toEqual(ok(undefined));
      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('leaves the cached page alone when the server fails unexpectedly', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(FIRST);
      fakes.meetings.failure = unexpected('HTTP 503');

      expect(await useCase.execute(FIRST)).toEqual(err(unexpected('HTTP 503')));
      expect(await fakes.meetingCache.readPage(aUserId(), { period: UPCOMING, limit: 2 })).toEqual(
        ok({ value: FIRST_PAGE, cachedAt: NOW }),
      );
    });
  });

  describe('the monitoring', () => {
    const PAGE_ATTRIBUTES = {
      [LOG_ATTRIBUTE.Period]: UPCOMING,
      [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.MeetingPage,
    };

    it('captures a cache that cannot be written, with the period and the resource', async () => {
      const { fakes, useCase } = setup();
      fakes.meetingCache.writeFailure = storageWriteFailed();

      const result = await useCase.execute(FIRST);

      expect(result).toEqual(
        ok({ data: FIRST_PAGE, source: { freshness: FRESHNESS.Fresh }, loadedAt: NOW }),
      );
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheWriteFailed,
          error: storageWriteFailed(),
          attributes: PAGE_ATTRIBUTES,
        },
      ]);
    });

    it('logs that a cached page was served, with the period and the resource', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute(FIRST);
      fakes.network.goOffline();

      await useCase.execute(FIRST);

      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Info,
          event: MONITORING_EVENT.ServedFromCache,
          attributes: PAGE_ATTRIBUTES,
        },
      ]);
    });

    it('captures a write-through that failed and a removal that failed, with the period and the resource', async () => {
      const { fakes, useCase } = setup();
      fakes.meetingCache.writeFailure = storageWriteFailed();
      fakes.meetingCache.removeFailure = storageWriteFailed();

      await useCase.execute(FIRST);

      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheWriteFailed,
          error: storageWriteFailed(),
          attributes: PAGE_ATTRIBUTES,
        },
        {
          event: MONITORING_EVENT.CacheRemoveFailed,
          error: storageWriteFailed(),
          attributes: PAGE_ATTRIBUTES,
        },
      ]);
    });

    it('captures a purge that failed when the session is refused', async () => {
      const { fakes, useCase } = setup();
      fakes.meetings.failure = unauthorized();
      fakes.meetingCache.purgeFailure = storageWriteFailed();

      await useCase.execute(FIRST);

      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CachePurgeFailed]);
    });
  });
});
