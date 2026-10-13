import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import type { Brand } from '../shared/Brand';
import { err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';

const MAX_EMAIL_LENGTH = 254;

/** One `@`, a dot in the domain, no whitespace. Deliverability is the remote source's business. */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A syntactically plausible email address, trimmed and in lower case. */
export type EmailAddress = Brand<string, 'EmailAddress'>;

export function parseEmailAddress(raw: string): Result<EmailAddress, ValidationError> {
  const email = raw.trim().toLowerCase();
  if (email.length === 0)
    return err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.Required));
  if (email.length > MAX_EMAIL_LENGTH) {
    return err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.TooLong));
  }
  if (!EMAIL_FORMAT.test(email)) {
    return err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.InvalidFormat));
  }
  return ok(email as EmailAddress);
}
