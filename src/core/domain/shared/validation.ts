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

const HIGH_SURROGATES = { first: 0xd800, last: 0xdbff } as const;
const LOW_SURROGATES = { first: 0xdc00, last: 0xdfff } as const;

const isIn = (unit: number, range: { readonly first: number; readonly last: number }): boolean =>
  unit >= range.first && unit <= range.last;

/**
 * True when the text is well-formed UTF-16: every surrogate is half of a pair, a high one followed
 * by a low one. A text that is not cannot be encoded as UTF-8 or percent-encoded, so it cannot be
 * put in a URL, a header or a file name: `encodeURIComponent` throws on it. (`String#isWellFormed`
 * does the same where the engine has it.)
 */
export function isWellFormedText(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (isIn(unit, LOW_SURROGATES)) return false;
    if (!isIn(unit, HIGH_SURROGATES)) continue;
    index += 1;
    if (index >= text.length || !isIn(text.charCodeAt(index), LOW_SURROGATES)) return false;
  }
  return true;
}

/** True when two members share a key: used to check that the members of a collection are unique. */
export function hasDuplicates(keys: readonly (string | number)[]): boolean {
  return new Set(keys).size !== keys.length;
}
