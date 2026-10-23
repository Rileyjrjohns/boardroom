import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

/** Why `attempt` gave no value. */
export const ATTEMPT_FAILURE = {
  /** The work threw or rejected. */
  Failed: 'failed',
  /** The work did not settle in time. */
  TimedOut: 'timedOut',
} as const;

export interface AttemptFailure {
  readonly kind: (typeof ATTEMPT_FAILURE)[keyof typeof ATTEMPT_FAILURE];
  /** A kind of failure, safe to put in the `cause` of an error: see `describeFailure`. */
  readonly cause: string;
}

/** What a failure that carries no code is reported as. */
const UNKNOWN_FAILURE = 'unknown failure';
const TIMEOUT_CAUSE = 'timeout';
const CODE_FORMAT = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * A diagnostic for a failure of a native module or of a database, safe to keep: the code the
 * failure carries when it has one (`ERR_SQLITE_ERROR`, `sqlite error 13`), and nothing else. Their
 * messages are left out on purpose: they can quote the statement, a path or a value.
 */
export function describeFailure(error: unknown): string {
  if (typeof error !== 'object' || error === null) return UNKNOWN_FAILURE;
  const { errcode, code } = error as { errcode?: unknown; code?: unknown };
  if (typeof errcode === 'number' && Number.isInteger(errcode)) return `sqlite error ${errcode}`;
  if (typeof code === 'string' && CODE_FORMAT.test(code)) return code;
  return UNKNOWN_FAILURE;
}

/**
 * Runs asynchronous work that can fail or hang, and settles in bounded time: with the value, with
 * the failure, or with a timeout. It is how the adapters of the device keep the promise of the
 * ports that every call settles, whatever the native side does. Work that is still running when
 * the time is up is left to finish, and what it ends with is ignored.
 */
export async function attempt<T>(
  work: () => Promise<T>,
  timeoutMillis: number,
): Promise<Result<T, AttemptFailure>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<typeof ATTEMPT_FAILURE.TimedOut>((resolve) => {
    timer = setTimeout(() => {
      resolve(ATTEMPT_FAILURE.TimedOut);
    }, timeoutMillis);
  });
  try {
    const outcome = await Promise.race([work().then((value) => ({ value })), expired]);
    return outcome === ATTEMPT_FAILURE.TimedOut
      ? err({ kind: ATTEMPT_FAILURE.TimedOut, cause: TIMEOUT_CAUSE })
      : ok(outcome.value);
  } catch (error) {
    return err({ kind: ATTEMPT_FAILURE.Failed, cause: describeFailure(error) });
  } finally {
    clearTimeout(timer);
  }
}
