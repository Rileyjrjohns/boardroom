import { z } from 'zod';

import { createDocument, parseConfidentialityLevel } from '@domain/entities/Document';
import type { Document } from '@domain/entities/Document';
import type { ValidationError } from '@domain/errors/ValidationError';
import { andThen } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseDocumentId } from '@domain/value-objects/ids';

// The metadata of a document of the API: `GET /documents/{id}`. Its content, `GET /documents/{id}/content`,
// is a file and not JSON: it has no schema (see `HttpClient.download`).

export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  confidentiality: z.string(),
  pageCount: z.number(),
});

export type DocumentWire = z.input<typeof documentSchema>;

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
