import { MAX_PAGE_LIMIT, createPageRequest } from '@domain/value-objects/PageRequest';
import { MAX_SIMULATED_LATENCY_MILLIS } from '@infrastructure/in-memory/SimulatedNetwork';

import {
  APP_LOCK_GRACE_PERIOD,
  MAX_CACHE_AGE,
  MAX_VOTE_DELIVERY_ATTEMPTS,
  MEETINGS_PAGE_SIZE,
  MOCK_SESSION_LIFETIME,
  SIMULATED_LATENCY,
} from './config';

const MILLIS_PER_SECOND = 1000;
const MILLIS_PER_HOUR = 3_600_000;
const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR;

// The values are pinned: changing one is a decision that shows in this file. The relations between
// them are what the app relies on, and are checked on their own.
describe('the configuration values', () => {
  it('are the ones the README and the comments of the module give', () => {
    expect(MAX_CACHE_AGE).toBe(7 * MILLIS_PER_DAY);
    expect(MAX_VOTE_DELIVERY_ATTEMPTS).toBe(5);
    expect(APP_LOCK_GRACE_PERIOD).toBe(30 * MILLIS_PER_SECOND);
    expect(MEETINGS_PAGE_SIZE).toBe(10);
    expect(SIMULATED_LATENCY).toBe(400);
    expect(MOCK_SESSION_LIFETIME).toBe(8 * MILLIS_PER_HOUR);
  });

  it('give a page size that the domain accepts in a page request, below its maximum', () => {
    expect(MEETINGS_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
    expect(createPageRequest({ limit: MEETINGS_PAGE_SIZE }).ok).toBe(true);
  });

  it('keep the app locked for a shorter time than a session lasts, and a session shorter than a copy kept offline', () => {
    expect(APP_LOCK_GRACE_PERIOD).toBeLessThan(MOCK_SESSION_LIFETIME);
    expect(MOCK_SESSION_LIFETIME).toBeLessThan(MAX_CACHE_AGE);
  });

  it('let the simulated server answer within the time a request is allowed to take', () => {
    expect(SIMULATED_LATENCY).toBeLessThanOrEqual(MAX_SIMULATED_LATENCY_MILLIS);
  });

  it('allow more than one attempt to deliver a vote, a whole number of them', () => {
    expect(Number.isInteger(MAX_VOTE_DELIVERY_ATTEMPTS)).toBe(true);
    expect(MAX_VOTE_DELIVERY_ATTEMPTS).toBeGreaterThan(1);
  });
});
