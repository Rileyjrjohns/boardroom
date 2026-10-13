import type { Document } from '@domain/entities/Document';
import { isConfidential } from '@domain/entities/Document';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import type { ScreenProtectionError } from '@domain/errors/ScreenProtectionError';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId, UserId } from '@domain/value-objects/ids';
import { createWatermark } from '@domain/value-objects/Watermark';
import type { Watermark } from '@domain/value-objects/Watermark';

import type { AuthSession } from '../../ports/AuthSession';
import type { DocumentCache, ViewableDocument } from '../../ports/DocumentCache';
import type { DocumentRepository } from '../../ports/DocumentRepository';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import type { DataSource, Loaded } from '../../shared/Loaded';
import { CACHE_RESOURCE, loadWithCacheFallback } from '../../shared/loadWithCacheFallback';
import type { CacheFallbackDeps } from '../../shared/loadWithCacheFallback';
import { requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';
import type { ScreenProtectionCoordinator } from '../../shared/ScreenProtectionCoordinator';

export interface OpenDocumentDeps extends CacheFallbackDeps {
  readonly auth: AuthSession;
  readonly documents: DocumentRepository;
  readonly documentCache: DocumentCache;
  /** The instance shared with `CloseDocument`. */
  readonly screenProtectionCoordinator: ScreenProtectionCoordinator;
}

export interface OpenDocumentInput {
  readonly documentId: DocumentId;
}

/** Everything the viewer needs to show a document. */
export interface OpenedDocument {
  readonly document: Document;
  readonly location: DocumentLocation;
  /** To be drawn over the content. See `Watermark` for what is decided where. */
  readonly watermark: Watermark;
  /** Fresh from the server, or the copy already viewed (stale) when there is no network. */
  readonly source: DataSource;
  /** True when the screen is protected against capture: always the case for a confidential document. */
  readonly screenProtected: boolean;
}

export type OpenDocumentError = SessionRequiredError | RepositoryError | ScreenProtectionError;

/**
 * Opens a document for reading. Requires a valid session, whose user owns the cached copy. Steps:
 *
 * 1. loads the metadata and the content location with the offline policy of
 *    `loadWithCacheFallback` (a document already viewed opens without network);
 * 2. when the document is confidential, turns the screen protection on, through the coordinator
 *    that remembers which confidential documents are open. This fails closed: if the protection
 *    cannot be enabled, the document is NOT returned and the error is, so the viewer never has a
 *    confidential location it could show unprotected;
 * 3. builds the watermark of the reader from the session and the clock, and logs the access.
 *
 * The screen calls `CloseDocument` with the id of the document when it leaves it.
 */
export class OpenDocument {
  constructor(private readonly deps: OpenDocumentDeps) {}

  async execute(input: OpenDocumentInput): Promise<Result<OpenedDocument, OpenDocumentError>> {
    const { clock, monitoring, screenProtectionCoordinator } = this.deps;

    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    const owner = session.value.user.id;
    const loaded = await this.load(owner, input.documentId);
    if (isErr(loaded)) return loaded;
    const { document, location } = loaded.value.data;

    const screenProtected = isConfidential(document);
    if (screenProtected) {
      const enabled = await screenProtectionCoordinator.acquire(document.id);
      if (isErr(enabled)) return enabled;
    }

    monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.DocumentOpened, {
      [LOG_ATTRIBUTE.DocumentId]: document.id,
      [LOG_ATTRIBUTE.UserId]: session.value.user.id,
      [LOG_ATTRIBUTE.Confidentiality]: document.confidentiality,
      [LOG_ATTRIBUTE.Freshness]: loaded.value.source.freshness,
    });

    return ok({
      document,
      location,
      watermark: createWatermark(session.value.user, clock.now()),
      source: loaded.value.source,
      screenProtected,
    });
  }

  private load(
    owner: UserId,
    documentId: DocumentId,
  ): Promise<Result<Loaded<ViewableDocument>, RepositoryError>> {
    const { documents, documentCache } = this.deps;

    return loadWithCacheFallback(this.deps, {
      resource: CACHE_RESOURCE.Document,
      attributes: { [LOG_ATTRIBUTE.DocumentId]: documentId },
      fetch: async (): Promise<Result<ViewableDocument, RepositoryError>> => {
        const document = await documents.get(documentId);
        if (isErr(document)) return document;
        const location = await documents.fetchContent(documentId);
        if (isErr(location)) return location;
        return ok({ document: document.value, location: location.value });
      },
      save: (viewable, cachedAt) => documentCache.save(owner, viewable, cachedAt),
      read: () => documentCache.read(owner, documentId),
      remove: () => documentCache.remove(owner, documentId),
    });
  }
}
