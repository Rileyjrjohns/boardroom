import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError, ValidationField } from '../errors/ValidationError';
import type { Brand } from '../shared/Brand';
import { err, map, ok } from '../shared/Result';
import type { Result } from '../shared/Result';

const MAX_IDENTIFIER_LENGTH = 128;

/**
 * Identifiers are opaque: they come from the remote source and are never interpreted, so they are
 * kept as received. They must only be usable as a key: not blank, not absurdly long.
 */
function parseIdentifier(field: ValidationField, raw: string): Result<string, ValidationError> {
  if (raw.trim().length === 0) return err(validationError(field, VALIDATION_RULE.Required));
  if (raw.length > MAX_IDENTIFIER_LENGTH) {
    return err(validationError(field, VALIDATION_RULE.TooLong));
  }
  return ok(raw);
}

export type UserId = Brand<string, 'UserId'>;
export type MeetingId = Brand<string, 'MeetingId'>;
export type AgendaItemId = Brand<string, 'AgendaItemId'>;
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
