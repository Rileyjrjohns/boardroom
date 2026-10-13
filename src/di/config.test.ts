import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  createPageRequest,
} from '@domain/value-objects/PageRequest';

import {
  APP_LOCK_GRACE_PERIOD,
  MAX_CACHE_AGE,
  MAX_VOTE_DELIVERY_ATTEMPTS,
  MEETINGS_PAGE_SIZE,
  MOCK_SESSION_LIFETIME,
  SIMULATED_LATENCY,
} from './config';

const MILLIS_PER_DAY = 86_400_000;

describe('the configuration values', () => {
  it('are valid durations, which importing the module already proves', () => {
    expect(MAX_CACHE_AGE).toBe(7 * MILLIS_PER_DAY);
    expect(APP_LOCK_GRACE_PERIOD).toBeGreaterThan(0);
    expect(SIMULATED_LATENCY).toBeGreaterThanOrEqual(0);
    expect(MOCK_SESSION_LIFETIME).toBeGreaterThan(0);
  });

  it('give a page size that the domain accepts in a page request', () => {
    expect(MEETINGS_PAGE_SIZE).toBeGreaterThanOrEqual(1);
    expect(MEETINGS_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
    expect(createPageRequest({ limit: MEETINGS_PAGE_SIZE }).ok).toBe(true);
    expect(DEFAULT_PAGE_LIMIT).toBeGreaterThan(0);
  });

  it('allow at least one attempt to deliver a vote, and a whole number of them', () => {
    expect(Number.isInteger(MAX_VOTE_DELIVERY_ATTEMPTS)).toBe(true);
    expect(MAX_VOTE_DELIVERY_ATTEMPTS).toBeGreaterThanOrEqual(1);
  });
});
