import type { Document } from '@domain/entities/Document';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { err } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId } from '@domain/value-objects/ids';
import type { DocumentRepository } from '@application/ports/DocumentRepository';
import type { Monitoring } from '@application/ports/Monitoring';

import { storeDocumentContent } from '../documents/storeDocumentContent';
import type { FileStore } from '../files/FileStore';

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
