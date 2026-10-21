import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { findConstant, valuesOf } from '../shared/constants';
import type { ValueOf } from '../shared/constants';
import { andThen, err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireIntegerInRange, requireText } from '../shared/validation';
import type { DocumentId } from '../value-objects/ids';

export const MAX_TITLE_LENGTH = 300;
const MAX_PAGE_COUNT = 10_000;

export const CONFIDENTIALITY_LEVEL = {
  Public: 'public',
  Internal: 'internal',
  Confidential: 'confidential',
} as const;

export type ConfidentialityLevel = ValueOf<typeof CONFIDENTIALITY_LEVEL>;

export function parseConfidentialityLevel(
  raw: string,
): Result<ConfidentialityLevel, ValidationError> {
  const level = findConstant(valuesOf(CONFIDENTIALITY_LEVEL), raw);
  return level === undefined
    ? err(validationError(VALIDATION_FIELD.ConfidentialityLevel, VALIDATION_RULE.UnknownValue))
    : ok(level);
}

/** The metadata of a document attached to a meeting. Its content is read through a location. */
export interface Document {
  readonly id: DocumentId;
  readonly title: string;
  readonly confidentiality: ConfidentialityLevel;
  readonly pageCount: number;
}

export interface DocumentInput {
  readonly id: DocumentId;
  readonly title: string;
  readonly confidentiality: ConfidentialityLevel;
  /** A whole number between 1 and `MAX_PAGE_COUNT`. */
  readonly pageCount: number;
}

export function createDocument(input: DocumentInput): Result<Document, ValidationError> {
  return andThen(requireText(VALIDATION_FIELD.Title, input.title, MAX_TITLE_LENGTH), (title) =>
    andThen(
      requireIntegerInRange(VALIDATION_FIELD.PageCount, input.pageCount, 1, MAX_PAGE_COUNT),
      (pageCount) => ok({ id: input.id, title, confidentiality: input.confidentiality, pageCount }),
    ),
  );
}

/** A confidential document is shown with its screen protected (every document carries a watermark). */
export function isConfidential(document: Document): boolean {
  return document.confidentiality === CONFIDENTIALITY_LEVEL.Confidential;
}
