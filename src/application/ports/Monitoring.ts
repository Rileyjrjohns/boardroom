import type { ValueOf } from '@domain/shared/constants';
import type { AppError } from '@domain/errors/AppError';

export const LOG_LEVEL = {
  Info: 'info',
  Warn: 'warn',
} as const;

export type LogLevel = ValueOf<typeof LOG_LEVEL>;

/**
 * Every event the application reports. A call site names one of these, never a free text, so the
 * events can be counted, alerted on and searched for.
 */
export const MONITORING_EVENT = {
  SessionExpired: 'sessionExpired',
  SignOutFailed: 'signOutFailed',
  CacheReadFailed: 'cacheReadFailed',
  CacheWriteFailed: 'cacheWriteFailed',
  CacheRemoveFailed: 'cacheRemoveFailed',
  CachePurgeFailed: 'cachePurgeFailed',
  CacheEntryDiscarded: 'cacheEntryDiscarded',
  ServedFromCache: 'servedFromCache',
  DocumentOpened: 'documentOpened',
  ScreenCaptureDetected: 'screenCaptureDetected',
  VoteSubmitted: 'voteSubmitted',
  VoteSubmitFailed: 'voteSubmitFailed',
  VoteQueued: 'voteQueued',
  VoteEnqueueFailed: 'voteEnqueueFailed',
  VoteRejected: 'voteRejected',
  VoteAttemptNotRecorded: 'voteAttemptNotRecorded',
  VoteSyncCompleted: 'voteSyncCompleted',
  VoteSyncInterrupted: 'voteSyncInterrupted',
  OutboxReadFailed: 'outboxReadFailed',
  /** A row of the local database no longer reads back as what was stored: it is dropped. */
  StoredRowDiscarded: 'storedRowDiscarded',
  /** The server answered something that does not have the shape of the API. */
  ResponseInvalid: 'responseInvalid',
  /** The local database could not be opened with its key and was created again, empty. */
  DatabaseRecreated: 'databaseRecreated',
} as const;

export type MonitoringEvent = ValueOf<typeof MONITORING_EVENT>;

/**
 * The names an event can carry data under. Identifiers, codes and counts only: never a name, an
 * email, a password, the content of a document, nor the choice of a vote (the ballot is secret).
 */
export const LOG_ATTRIBUTE = {
  UserId: 'userId',
  MeetingId: 'meetingId',
  ResolutionId: 'resolutionId',
  DocumentId: 'documentId',
  Period: 'period',
  Resource: 'resource',
  Freshness: 'freshness',
  Confidentiality: 'confidentiality',
  CaptureKind: 'captureKind',
  ErrorCode: 'errorCode',
  Attempts: 'attempts',
  Synced: 'synced',
  Rejected: 'rejected',
  Remaining: 'remaining',
  /** The places a payload broke the schema (`agenda.0.status`), never what it held. */
  IssuePaths: 'issuePaths',
  /** Why something happened, as one of the const sets of the code that reports it. */
  Reason: 'reason',
} as const;

export type LogAttribute = ValueOf<typeof LOG_ATTRIBUTE>;

export type LogAttributes = { readonly [Key in LogAttribute]?: string | number | boolean };

/**
 * Structured logs and error reports, sent to whatever tool the adapter wraps. Fire and forget: both
 * methods return nothing, return at once, wait for nothing and never throw, whatever happens to the
 * tool behind them. The `cause` of an error may reach the tool, and it holds a status code or a
 * kind of failure, nothing else: neither it nor any attribute is ever a file path, a URL, the
 * location of a document or its title, a name, an email, nor the choice of a vote (the ballot is
 * secret). Identifiers and codes only (see the errors).
 *
 * The convention in the use cases: an error that is returned to the caller is the caller's to
 * report; an error that a use case swallows (a cache that cannot be written, say) is captured here,
 * so that it does not vanish.
 */
export interface Monitoring {
  log(level: LogLevel, event: MonitoringEvent, attributes?: LogAttributes): void;
  captureError(event: MonitoringEvent, error: AppError, attributes?: LogAttributes): void;
}
