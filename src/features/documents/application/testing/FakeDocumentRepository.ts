import type { FakeNetwork } from '@core/application/testing/FakeNetwork';
import { copyPlain } from '@core/application/testing/copyPlain';
import { forbidden, networkUnavailable, notFound } from '@core/domain/errors/RepositoryError';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { DocumentId } from '@core/domain/value-objects/ids';
import type { DocumentLocation } from '@features/documents/domain/value-objects/DocumentLocation';
import type { Document } from '@features/meetings/domain/entities/Document';

import type { DocumentRepository } from '../ports/DocumentRepository';

/** The remote documents of a test: a document and the location of its content go together. */
export class FakeDocumentRepository implements DocumentRepository {
  /** Makes every call fail with this error while set. */
  failure: RepositoryError | undefined;
  /** Makes only `fetchContent` fail with this error while set: the metadata is still served. */
  contentFailure: RepositoryError | undefined;

  /**
   * Called when a request arrives, before the server answers: a test uses it to change the world
   * while the request is in flight (another user signs in, say).
   */
  onRequest: (() => void | Promise<void>) | undefined;

  readonly getCalls: DocumentId[] = [];
  readonly fetchContentCalls: DocumentId[] = [];

  private readonly forbiddenIds = new Set<DocumentId>();
  private readonly documents = new Map<
    DocumentId,
    { document: Document; location: DocumentLocation }
  >();

  constructor(private readonly network: FakeNetwork) {}

  addDocument(document: Document, location: DocumentLocation): void {
    this.documents.set(document.id, { document, location });
  }

  /** The server has the document but refuses the caller: it answers `forbidden`. */
  forbid(id: DocumentId): void {
    this.forbiddenIds.add(id);
  }

  async get(id: DocumentId): Promise<Result<Document, RepositoryError>> {
    this.getCalls.push(id);
    await this.onRequest?.();
    const unavailable = this.unavailable();
    if (unavailable !== undefined) return err(unavailable);
    if (this.forbiddenIds.has(id)) return err(forbidden());
    const entry = this.documents.get(id);
    return entry === undefined ? err(notFound()) : ok(copyPlain(entry.document));
  }

  async fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>> {
    this.fetchContentCalls.push(id);
    await this.onRequest?.();
    const unavailable = this.unavailable() ?? this.contentFailure;
    if (unavailable !== undefined) return err(unavailable);
    if (this.forbiddenIds.has(id)) return err(forbidden());
    const entry = this.documents.get(id);
    return entry === undefined ? err(notFound()) : ok(entry.location);
  }

  private unavailable(): RepositoryError | undefined {
    return this.network.online ? this.failure : networkUnavailable();
  }
}
