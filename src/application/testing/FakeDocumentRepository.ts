import type { Document } from '@domain/entities/Document';
import { networkUnavailable, notFound } from '@domain/errors/RepositoryError';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId } from '@domain/value-objects/ids';

import type { DocumentRepository } from '../ports/DocumentRepository';

import type { FakeNetwork } from './FakeNetwork';

/** The remote documents of a test: a document and the location of its content go together. */
export class FakeDocumentRepository implements DocumentRepository {
  /** Makes every call fail with this error while set. */
  failure: RepositoryError | undefined;
  /** Makes only `fetchContent` fail with this error while set: the metadata is still served. */
  contentFailure: RepositoryError | undefined;

  readonly getCalls: DocumentId[] = [];
  readonly fetchContentCalls: DocumentId[] = [];

  private readonly documents = new Map<
    DocumentId,
    { document: Document; location: DocumentLocation }
  >();

  constructor(private readonly network: FakeNetwork) {}

  addDocument(document: Document, location: DocumentLocation): void {
    this.documents.set(document.id, { document, location });
  }

  get(id: DocumentId): Promise<Result<Document, RepositoryError>> {
    this.getCalls.push(id);
    const unavailable = this.unavailable();
    if (unavailable !== undefined) return Promise.resolve(err(unavailable));
    const entry = this.documents.get(id);
    return Promise.resolve(entry === undefined ? err(notFound()) : ok(entry.document));
  }

  fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>> {
    this.fetchContentCalls.push(id);
    const unavailable = this.unavailable() ?? this.contentFailure;
    if (unavailable !== undefined) return Promise.resolve(err(unavailable));
    const entry = this.documents.get(id);
    return Promise.resolve(entry === undefined ? err(notFound()) : ok(entry.location));
  }

  private unavailable(): RepositoryError | undefined {
    return this.network.online ? this.failure : networkUnavailable();
  }
}
