import { durationFromMillis } from '@domain/value-objects/Duration';
import { valid } from '@infrastructure/shared/valid';

// The configuration values that the use cases and the simulated server take, in one place, each
// with the reason for its value. They are checked when this module is first imported (a duration
// that is not valid fails there, loudly, and `config.test.ts` imports it).

const MILLIS_PER_SECOND = 1000;
const MILLIS_PER_HOUR = 3_600_000;
const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR;

/** A week covers a board's usual cycle, and older saved content has most likely moved on. */
export const MAX_CACHE_AGE = valid(durationFromMillis(7 * MILLIS_PER_DAY));

/** Rides out a bad moment of the server without letting one failing vote hold the queue for ever. */
export const MAX_VOTE_DELIVERY_ATTEMPTS = 5;

/** Long enough to answer a message and come back, short enough that a phone left on a table locks. */
export const APP_LOCK_GRACE_PERIOD = valid(durationFromMillis(30 * MILLIS_PER_SECOND));

/** Ten rows fill a phone screen and arrive quickly; the next page loads when the end is near. */
export const MEETINGS_PAGE_SIZE = 10;

/** Long enough to see the loading states in the demo, short enough not to get in the way. */
export const SIMULATED_LATENCY = valid(durationFromMillis(400));

/** A working day, so that a session left open overnight expires by itself. */
export const MOCK_SESSION_LIFETIME = valid(durationFromMillis(8 * MILLIS_PER_HOUR));

/** The sign-in screen arrives in step 4; until then this is the only way to get a session there. */
export const MOCK_STARTS_SIGNED_IN = true;
