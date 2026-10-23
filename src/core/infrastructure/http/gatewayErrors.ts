import { REPOSITORY_ERROR_CODE, unexpected } from '@core/domain/errors/RepositoryError';
import type { GatewayError, RepositoryError } from '@core/domain/errors/RepositoryError';

import { HTTP_FAILURE_CODE } from './HttpClient';
import type { HttpFailure } from './HttpClient';
import { HTTP_STATUS } from './protocol';
import { statusCause } from './statusCause';

/**
 * What a call that addresses no particular item (a listing, a vote) can fail with. A 403, a 404 or
 * a rejection is not a thing such a call has a name for: it is `unexpected`, with the status as the
 * only cause.
 */
export function asGatewayError(failure: HttpFailure): GatewayError {
  switch (failure.code) {
    case REPOSITORY_ERROR_CODE.NetworkUnavailable:
    case REPOSITORY_ERROR_CODE.Unauthorized:
    case REPOSITORY_ERROR_CODE.Unexpected:
      return failure;
    case REPOSITORY_ERROR_CODE.Forbidden:
      return unexpected(statusCause(HTTP_STATUS.Forbidden));
    case REPOSITORY_ERROR_CODE.NotFound:
      return unexpected(statusCause(HTTP_STATUS.NotFound));
    case HTTP_FAILURE_CODE.RequestRejected:
      return unexpected(statusCause(HTTP_STATUS.UnprocessableContent));
  }
}

/** What a call that addresses one item can fail with. A rejection is not one of them. */
export function asRepositoryError(failure: HttpFailure): RepositoryError {
  switch (failure.code) {
    case REPOSITORY_ERROR_CODE.Forbidden:
    case REPOSITORY_ERROR_CODE.NotFound:
      return failure;
    case REPOSITORY_ERROR_CODE.NetworkUnavailable:
    case REPOSITORY_ERROR_CODE.Unauthorized:
    case REPOSITORY_ERROR_CODE.Unexpected:
    case HTTP_FAILURE_CODE.RequestRejected:
      return asGatewayError(failure);
  }
}
