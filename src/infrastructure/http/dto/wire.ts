import { z } from 'zod';

import type { Instant } from '@domain/value-objects/Instant';

// What the schemas of the API have in common: the way an instant is written, and the diagnostic of
// a payload that does not have the expected shape.

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

/** The most paths a diagnostic lists: a payload that is wrong everywhere is not worth more. */
const MAX_REPORTED_PATHS = 10;

const PATH_SEPARATOR = '.';
const PATHS_SEPARATOR = ',';
/** What stands for the root of a payload, when the payload itself has the wrong type. */
const ROOT_PATH = '$';

/**
 * Where a payload broke its schema, as `agenda.0.status,title`: the names of the fields and the
 * positions in the lists, never a value. Sorted and without repeats, so that the same flaw gives
 * the same diagnostic.
 */
export function issuePathsOf(error: z.ZodError): string {
  const paths = error.issues.map((issue) =>
    issue.path.length === 0 ? ROOT_PATH : issue.path.map(String).join(PATH_SEPARATOR),
  );
  return [...new Set(paths)].sort().slice(0, MAX_REPORTED_PATHS).join(PATHS_SEPARATOR);
}
