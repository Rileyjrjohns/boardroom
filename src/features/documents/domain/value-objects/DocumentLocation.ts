import { VALIDATION_FIELD } from '@core/domain/errors/ValidationError';
import type { ValidationError } from '@core/domain/errors/ValidationError';
import type { Brand } from '@core/domain/shared/Brand';
import { map } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { requireText } from '@core/domain/shared/validation';

const MAX_LOCATION_LENGTH = 2048;

/**
 * An opaque reference to where the content of a document can be read right now (a file in the
 * private storage of the app, for example). Produced by an adapter, consumed by the viewer, never
 * interpreted by the domain or the application: they only carry it from one to the other.
 */
export type DocumentLocation = Brand<string, 'DocumentLocation'>;

export function parseDocumentLocation(raw: string): Result<DocumentLocation, ValidationError> {
  return map(
    requireText(VALIDATION_FIELD.DocumentLocation, raw, MAX_LOCATION_LENGTH),
    (location) => location as DocumentLocation,
  );
}
