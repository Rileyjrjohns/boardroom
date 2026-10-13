import type { Document } from '@domain/entities/Document';
import { forbidden, networkUnavailable, notFound } from '@domain/errors/RepositoryError';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId } from '@domain/value-objects/ids';

import type { DocumentRepository } from '../ports/DocumentRepository';

import { copyPlain } from './copyPlain';
import type { FakeNetwork } from './FakeNetwork';

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
