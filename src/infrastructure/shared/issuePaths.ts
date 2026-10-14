import type { z } from 'zod';

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
