import type { AppError } from '@core/domain/errors/AppError';

/**
 * Why the `SessionGate` refused to say that the user who asked is still the one signed in. The
 * error is of the family the gate speaks (`Refusal`): the core does not know which it is, only that
 * it is an error to return.
 */
export interface SessionRefusal<Refusal extends AppError = AppError> {
  /**
   * The error the caller returns: nobody is signed in, the session has expired, somebody else is
   * signed in now, or the app is locked.
   */
  readonly error: Refusal;
  /**
   * Whether the session is still the one that asked and only waits for the app to be unlocked. What
   * the device holds for that user is then still theirs, and is left alone; any other refusal
   * means the user is gone.
   */
  readonly sessionKept: boolean;
}
