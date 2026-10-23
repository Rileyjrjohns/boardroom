import { durationFromMillis } from '@core/domain/value-objects/Duration';
import { valid } from '@core/infrastructure/shared/valid';

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

/**
 * The mock configuration starts signed out, like the real one: the user signs in with an account
 * of the simulated server. A test that wants the demo user signed in at start asks for it through
 * the `mockStartsSignedIn` setting.
 */
export const MOCK_STARTS_SIGNED_IN = false;

/**
 * How long a request to the API may take, the answer included, before it counts as a network
 * failure. Long enough for a mobile network on a bad day, short enough that the user is not left
 * staring at a spinner: an offline board member gets the saved copy within the quarter of a minute.
 */
export const HTTP_REQUEST_TIMEOUT = valid(durationFromMillis(15 * MILLIS_PER_SECOND));

/**
 * How long the download of a document may take, before it counts as a network failure. A file takes
 * longer than a page of JSON (a board pack is some megabytes, on a mobile network), so it has a
 * budget of its own: a minute is enough for the largest file the app accepts on a slow connection,
 * and an offline board member whose document was seen before gets the saved copy within the minute.
 */
export const DOCUMENT_DOWNLOAD_TIMEOUT = valid(durationFromMillis(60 * MILLIS_PER_SECOND));

/** The bounds of a request timeout that the configuration accepts. */
export const MIN_HTTP_REQUEST_TIMEOUT = valid(durationFromMillis(MILLIS_PER_SECOND));
export const MAX_HTTP_REQUEST_TIMEOUT = valid(durationFromMillis(60 * MILLIS_PER_SECOND));

/**
 * Whether the passcode of the device is accepted when the biometrics do not recognise the user.
 * No. The biometrics unlock the app and confirm a vote, which is secret and final: a passcode is
 * something a colleague or a relative may have seen being typed, a fingerprint or a face is not.
 * The price is a user who is locked out of the biometrics (too many failed attempts, which the
 * system clears with its own passcode) waiting for them to come back, or signing out and in again;
 * a board that prefers the other trade-off turns this on, and nothing else changes.
 */
export const ALLOW_DEVICE_PASSCODE_FALLBACK = false;

/** The name of the local database file. It is part of what is stored on the device: do not rename it. */
export const DATABASE_NAME = 'boardroom.db';
