import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId } from '@domain/value-objects/ids';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import type { Document } from '@domain/entities/Document';
import type { Result } from '@domain/shared/Result';
import type { DocumentRepository } from '@application/ports/DocumentRepository';

import type { InMemoryBackend } from './InMemoryBackend';
import type { InMemoryDocumentContent } from './InMemoryDocumentContent';

/**
 * The documents of the simulated server. Downloading the content is simulated by storing its
 * location among the files of the device, so that the document cache can tell when it is gone.
 */
export class InMemoryDocumentRepository implements DocumentRepository {
  constructor(
    private readonly backend: InMemoryBackend,
    private readonly content: InMemoryDocumentContent,
  ) {}

  get(id: DocumentId): Promise<Result<Document, RepositoryError>> {
    return this.backend.getDocument(id);
  }

  async fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>> {
    const location = await this.backend.fetchDocumentContent(id);
    if (location.ok) this.content.store(location.value);
    return location;
  }
}
