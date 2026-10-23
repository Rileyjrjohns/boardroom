import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError, ValidationField } from '../errors/ValidationError';
import type { Brand } from '../shared/Brand';
import { err, map, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { isWellFormedText } from '../shared/validation';

const MAX_IDENTIFIER_LENGTH = 128;

/** What a path reads as a directory, so an id cannot be either: `/meetings/..` is `/`. */
const DIRECTORY_NAMES: readonly string[] = ['.', '..'];

/**
 * Identifiers are opaque: they come from the remote source and are never interpreted, so they are
 * kept as received. They must only be usable as a key and as a segment of a path: not blank, not
 * absurdly long, well-formed UTF-16 (a lone surrogate cannot be encoded), and neither of the
 * directory names `.` and `..`, which a URL would resolve instead of passing on.
 */
function parseIdentifier(field: ValidationField, raw: string): Result<string, ValidationError> {
  if (raw.trim().length === 0) return err(validationError(field, VALIDATION_RULE.Required));
  if (raw.length > MAX_IDENTIFIER_LENGTH) {
    return err(validationError(field, VALIDATION_RULE.TooLong));
  }
  if (!isWellFormedText(raw) || DIRECTORY_NAMES.includes(raw)) {
    return err(validationError(field, VALIDATION_RULE.InvalidFormat));
  }
  return ok(raw);
}

export type UserId = Brand<string, 'UserId'>;
export type MeetingId = Brand<string, 'MeetingId'>;
export type AgendaItemId = Brand<string, 'AgendaItemId'>;
/**
 * Resolution ids are globally unique: no two meetings have a resolution with the same id. The
 * idempotency key of a vote is built from the resolution and the voter, and does not hold the
 * meeting, so a shared id would make a vote on one meeting look like a vote on the other. The
 * remote source guarantees it, and an adapter that simulates one refuses a content that breaks it.
 */
export type ResolutionId = Brand<string, 'ResolutionId'>;
export type DocumentId = Brand<string, 'DocumentId'>;

export function parseUserId(raw: string): Result<UserId, ValidationError> {
  return map(parseIdentifier(VALIDATION_FIELD.UserId, raw), (id) => id as UserId);
}

export function parseMeetingId(raw: string): Result<MeetingId, ValidationError> {
  return map(parseIdentifier(VALIDATION_FIELD.MeetingId, raw), (id) => id as MeetingId);
}

export function parseAgendaItemId(raw: string): Result<AgendaItemId, ValidationError> {
  return map(parseIdentifier(VALIDATION_FIELD.AgendaItemId, raw), (id) => id as AgendaItemId);
}

export function parseResolutionId(raw: string): Result<ResolutionId, ValidationError> {
  return map(parseIdentifier(VALIDATION_FIELD.ResolutionId, raw), (id) => id as ResolutionId);
}

export function parseDocumentId(raw: string): Result<DocumentId, ValidationError> {
  return map(parseIdentifier(VALIDATION_FIELD.DocumentId, raw), (id) => id as DocumentId);
}
