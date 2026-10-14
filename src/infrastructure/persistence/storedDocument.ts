import { z } from 'zod';

import { createDocument, parseConfidentialityLevel } from '@domain/entities/Document';
import type { Document } from '@domain/entities/Document';
import type { ValidationError } from '@domain/errors/ValidationError';
import { andThen } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseDocumentId } from '@domain/value-objects/ids';

// What the cache of documents keeps in a row of `document_entries`, apart from the owner, the
// instant and the location, which have columns of their own: the metadata of the document, as
// JSON, in the format of the database. It is the cache's own, like `storedMeeting.ts`, and not the
// DTO of the API, so that a change of the API (a field renamed) cannot make the rows already on
// the devices unreadable, and a change of what is stored is a decision of the cache. It happens to
// look like what the API wrote when the cache was first written, and a test holds a row exactly as
// that version wrote it and reads it.
//
// The schema checks that each field is there with the type that was stored and ignores the ones it
// does not know. The values themselves are checked by the factory of the domain.

export const storedDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  confidentiality: z.string(),
  pageCount: z.number(),
});

export type StoredDocument = z.input<typeof storedDocumentSchema>;

/** A document as the cache keeps it. */
export function storedDocumentOf(document: Document): StoredDocument {
  return {
    id: document.id,
    title: document.title,
    confidentiality: document.confidentiality,
    pageCount: document.pageCount,
  };
}

/** A document back from what the cache kept, through the factory of the domain. */
export function documentOf(
  stored: z.output<typeof storedDocumentSchema>,
): Result<Document, ValidationError> {
  return andThen(parseDocumentId(stored.id), (id) =>
    andThen(parseConfidentialityLevel(stored.confidentiality), (confidentiality) =>
      createDocument({
        id,
        title: stored.title,
        confidentiality,
        pageCount: stored.pageCount,
      }),
    ),
  );
}
