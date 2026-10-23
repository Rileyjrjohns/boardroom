import type { Monitoring } from '@core/application/ports/Monitoring';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import { err } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { DocumentId } from '@core/domain/value-objects/ids';
import type { FileStore } from '@core/infrastructure/files/FileStore';
import type { DocumentRepository } from '@features/documents/application/ports/DocumentRepository';
import type { DocumentLocation } from '@features/documents/domain/value-objects/DocumentLocation';
import { storeDocumentContent } from '@features/documents/infrastructure/storeDocumentContent';
import type { Document } from '@features/meetings/domain/entities/Document';

import type { InMemoryBackend } from './InMemoryBackend';

/**
 * The documents of the simulated server. Downloading the content is real in everything but the
 * network: the server makes a PDF for the document, and it is written to the files of the device
 * (`FileStore`) the way the HTTP repository writes what it downloads, so the viewer opens a file in
 * the mock configuration as it does in the http one.
 */
export class InMemoryDocumentRepository implements DocumentRepository {
  constructor(
    private readonly backend: InMemoryBackend,
    private readonly files: FileStore,
    private readonly monitoring: Monitoring,
  ) {}

  get(id: DocumentId): Promise<Result<Document, RepositoryError>> {
    return this.backend.getDocument(id);
  }

  async fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>> {
    const served = await this.backend.fetchDocumentContent(id);
    if (!served.ok) return served;

    const stored = await storeDocumentContent(
      { files: this.files, monitoring: this.monitoring },
      { ...served.value, documentId: id },
    );
    return stored.ok ? stored : err(stored.error);
  }
}
