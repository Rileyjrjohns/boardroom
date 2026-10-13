import { z } from 'zod';

import { createDocument, parseConfidentialityLevel } from '@domain/entities/Document';
import type { Document } from '@domain/entities/Document';
import type { ValidationError } from '@domain/errors/ValidationError';
import { andThen } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseDocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import { parseDocumentId } from '@domain/value-objects/ids';

// The documents of the API: `GET /documents/{id}` and `GET /documents/{id}/content`.

export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  confidentiality: z.string(),
  pageCount: z.number(),
});

/** Where the content of a document can be read: an opaque reference the server hands out. */
export const documentContentSchema = z.object({
  location: z.string(),
});

export type DocumentWire = z.input<typeof documentSchema>;
export type DocumentContentWire = z.input<typeof documentContentSchema>;

export function toDocument(
  wire: z.output<typeof documentSchema>,
): Result<Document, ValidationError> {
  return andThen(parseDocumentId(wire.id), (id) =>
    andThen(parseConfidentialityLevel(wire.confidentiality), (confidentiality) =>
      createDocument({ id, title: wire.title, confidentiality, pageCount: wire.pageCount }),
    ),
  );
}

export function toDocumentWire(document: Document): DocumentWire {
  return {
    id: document.id,
    title: document.title,
    confidentiality: document.confidentiality,
    pageCount: document.pageCount,
  };
}

export function toDocumentLocation(
  wire: z.output<typeof documentContentSchema>,
): Result<DocumentLocation, ValidationError> {
  return parseDocumentLocation(wire.location);
}

export function toDocumentContentWire(location: DocumentLocation): DocumentContentWire {
  return { location };
}
