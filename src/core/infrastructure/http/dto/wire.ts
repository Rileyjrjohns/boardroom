import { z } from 'zod';

import type { Instant } from '@core/domain/value-objects/Instant';

// What the schemas of the API have in common: the way an instant is written.

/**
 * ISO 8601 date and time with a zone, as `Date.prototype.toISOString` writes it (a `Z`, and a year
 * with a sign and six digits outside 0000-9999) or with an offset: `2030-03-17T17:46:40.000Z`,
 * `2030-03-17T18:46:40+01:00`.
 */
const ISO_8601_INSTANT =
  /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const NOT_AN_INSTANT = 'not an instant';

/** An instant on the wire: an ISO 8601 string, read as a number of milliseconds since the epoch. */
export const isoInstantSchema = z
  .string()
  .regex(ISO_8601_INSTANT)
  .transform((text, context) => {
    const millis = Date.parse(text);
    if (Number.isNaN(millis)) {
      context.addIssue({ code: 'custom', message: NOT_AN_INSTANT });
      return z.NEVER;
    }
    return millis;
  });

/** An instant as the API writes it. */
export function toIsoString(instant: Instant): string {
  return new Date(instant).toISOString();
}
