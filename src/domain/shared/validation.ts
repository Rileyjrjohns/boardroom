import { VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError, ValidationField } from '../errors/ValidationError';

import { err, ok } from './Result';
import type { Result } from './Result';

/** The text with its surrounding whitespace removed. It must not be blank nor longer than `maxLength`. */
export function requireText(
  field: ValidationField,
  raw: string,
  maxLength: number,
): Result<string, ValidationError> {
  const text = raw.trim();
  if (text.length === 0) return err(validationError(field, VALIDATION_RULE.Required));
  if (text.length > maxLength) return err(validationError(field, VALIDATION_RULE.TooLong));
  return ok(text);
}

/**
 * Like `requireText` for a text that may be missing. A missing or blank text is no text: the result
 * is `undefined`, not an error.
 */
export function optionalText(
  field: ValidationField,
  raw: string | undefined,
  maxLength: number,
): Result<string | undefined, ValidationError> {
  if (raw === undefined || raw.trim().length === 0) return ok(undefined);
  return requireText(field, raw, maxLength);
}

/** An integer between `min` and `max`, both included. */
export function requireIntegerInRange(
  field: ValidationField,
  value: number,
  min: number,
  max: number,
): Result<number, ValidationError> {
  if (!Number.isInteger(value)) return err(validationError(field, VALIDATION_RULE.NotAnInteger));
  if (value < min || value > max) return err(validationError(field, VALIDATION_RULE.OutOfRange));
  return ok(value);
}

/** True when two members share a key: used to check that the members of a collection are unique. */
export function hasDuplicates(keys: readonly (string | number)[]): boolean {
  return new Set(keys).size !== keys.length;
}
