import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';

import { MEETINGS_ERROR_KEYS } from '../i18n/translationKeys';
import type { MeetingsErrorCode } from '../i18n/translationKeys';

import { isQueryFailure } from './QueryFailure';

function isMeetingsErrorCode(code: string): code is MeetingsErrorCode {
  return Object.prototype.hasOwnProperty.call(MEETINGS_ERROR_KEYS, code);
}

/**
 * The code that says why a query failed, from whatever it rejected with. A query function throws
 * a `QueryFailure`, but nothing stops a bug from rejecting with something else (an `Error`, a
 * string, `undefined`), and a screen must not crash on it: anything that is not the failure of a
 * use case, or whose code no screen has a text for, is `unexpected`. This is the only place that
 * reads the code of a rejection; the retry policy, the screens and the query cache all go
 * through it.
 */
export function errorCodeOf(error: unknown): MeetingsErrorCode {
  if (isQueryFailure(error) && isMeetingsErrorCode(error.error.code)) return error.error.code;
  return REPOSITORY_ERROR_CODE.Unexpected;
}
