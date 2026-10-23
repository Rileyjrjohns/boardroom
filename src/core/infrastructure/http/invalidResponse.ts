import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { unexpected } from '@core/domain/errors/RepositoryError';
import type { UnexpectedError } from '@core/domain/errors/RepositoryError';
import type { ValidationError } from '@core/domain/errors/ValidationError';

/** What the server answered, for the logs: the resource, never a value of it. */
export const HTTP_RESOURCE = {
  Session: 'session',
  MeetingPage: 'meetingPage',
  Meeting: 'meeting',
  Document: 'document',
  DocumentContent: 'documentContent',
  Vote: 'vote',
} as const;

export type HttpResource = (typeof HTTP_RESOURCE)[keyof typeof HTTP_RESOURCE];

/** The `cause` of the error an answer that does not have the shape of the API becomes. */
const INVALID_RESPONSE_CAUSE = 'invalid response';

/** The path that stands for the body as a whole, when it is not even JSON. */
export const WHOLE_BODY_PATH = '$';

/**
 * An answer that breaks the schema of the API becomes `unexpected`, and the places where it broke
 * go to the monitoring: the paths of the fields, never what they held.
 */
export function schemaViolation(
  monitoring: Monitoring,
  resource: HttpResource,
  issuePaths: string,
): UnexpectedError {
  const error = unexpected(INVALID_RESPONSE_CAUSE);
  monitoring.captureError(MONITORING_EVENT.ResponseInvalid, error, {
    [LOG_ATTRIBUTE.Resource]: resource,
    [LOG_ATTRIBUTE.IssuePaths]: issuePaths,
  });
  return error;
}

/**
 * An answer that has the shape of the API but breaks a rule of the domain (a blank title, a status
 * nobody knows) becomes `unexpected` too. The error of the domain names a field and a rule, not
 * the value, so it can go to the monitoring as it is.
 */
export function domainViolation(
  monitoring: Monitoring,
  resource: HttpResource,
  violation: ValidationError,
): UnexpectedError {
  monitoring.captureError(MONITORING_EVENT.ResponseInvalid, violation, {
    [LOG_ATTRIBUTE.Resource]: resource,
  });
  return unexpected(INVALID_RESPONSE_CAUSE);
}

/** Why the file an answer carried was refused, for the logs. */
export const CONTENT_VIOLATION = {
  /** It does not start with the signature of the kind of file it was said to be. */
  WrongSignature: 'wrongSignature',
  /** The answer gave no version, or one that is not a usable `ETag`. */
  NoVersion: 'noVersion',
} as const;

/** Why an answer that is well formed was refused, for the logs. */
export const IDENTITY_VIOLATION = {
  /** It describes another item than the one that was asked for. */
  OtherItem: 'otherItem',
} as const;

export type IdentityViolation = (typeof IDENTITY_VIOLATION)[keyof typeof IDENTITY_VIOLATION];

export type ContentViolation = (typeof CONTENT_VIOLATION)[keyof typeof CONTENT_VIOLATION];

/**
 * A file that does not have the shape of the API (it is not the kind of file the server said, or it
 * comes without a version) becomes `unexpected`, and the monitoring is told which of the two it
 * was, and nothing of the file.
 */
export function contentViolation(
  monitoring: Monitoring,
  resource: HttpResource,
  violation: ContentViolation,
): UnexpectedError {
  const error = unexpected(INVALID_RESPONSE_CAUSE);
  monitoring.captureError(MONITORING_EVENT.ResponseInvalid, error, {
    [LOG_ATTRIBUTE.Resource]: resource,
    [LOG_ATTRIBUTE.Reason]: violation,
  });
  return error;
}

/**
 * An answer that has the shape of the API but is about another item than the one that was asked
 * for (a server, a proxy or a cache that mixes up two requests) becomes `unexpected`. It is not
 * trusted: the metadata of one document must never be shown for another, nor saved under its
 * identifier. The monitoring is told which rule was broken, and neither identifier.
 */
export function identityViolation(
  monitoring: Monitoring,
  resource: HttpResource,
  violation: IdentityViolation,
): UnexpectedError {
  const error = unexpected(INVALID_RESPONSE_CAUSE);
  monitoring.captureError(MONITORING_EVENT.ResponseInvalid, error, {
    [LOG_ATTRIBUTE.Resource]: resource,
    [LOG_ATTRIBUTE.Reason]: violation,
  });
  return error;
}
