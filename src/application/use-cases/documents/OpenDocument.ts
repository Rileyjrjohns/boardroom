import type { Document } from '@domain/entities/Document';
import { isConfidential } from '@domain/entities/Document';
import type { SessionChangedError } from '@domain/errors/AuthenticationError';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import type { ScreenProtectionError } from '@domain/errors/ScreenProtectionError';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId, UserId } from '@domain/value-objects/ids';
import { createWatermark } from '@domain/value-objects/Watermark';
import type { Watermark } from '@domain/value-objects/Watermark';

import type { DocumentCache, ViewableDocument } from '../../ports/DocumentCache';
import type { DocumentRepository } from '../../ports/DocumentRepository';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { FRESHNESS } from '../../shared/Loaded';
import type { DataSource, Loaded } from '../../shared/Loaded';
import { CACHE_RESOURCE } from '../../shared/CacheResource';
import { loadWithCacheFallback } from '../../shared/loadWithCacheFallback';
import type { CacheFallbackDeps } from '../../shared/loadWithCacheFallback';
import { requireSameUser, requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';
import type { ScreenProtectionCoordinator } from '../../shared/ScreenProtectionCoordinator';

export interface OpenDocumentDeps extends CacheFallbackDeps {
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
  /**
   * True when the screen is protected against capture: always the case for a confidential
   * document, and for any document served from the cache, whatever level the cache remembers.
   */
  readonly screenProtected: boolean;
}

export type OpenDocumentError =
  SessionRequiredError | SessionChangedError | RepositoryError | ScreenProtectionError;

/**
 * Opens a document for reading. Requires a valid session, whose user owns the cached copy. Steps:
 *
 * 1. loads the metadata and the content location with the offline policy of
 *    `loadWithCacheFallback` (a document already viewed opens without network). The metadata and
 *    the content come together, from the server or from the cache: if any part of what is returned
 *    came from the cache, the whole is stale;
 * 2. checks again that the user who asked is still the one signed in, and the app unlocked,
 *    because the load can take long. Otherwise the answer is `sessionChanged` and nothing is
 *    protected or returned: the content of one user must never come back under another's name.
 *    The watermark is built from the session of this check;
 * 3. turns the screen protection on when the document is confidential OR served from the cache,
 *    through the coordinator that remembers which views are open. A copy in the cache can be
 *    older than the last change of the classification of the document (it may have been public
 *    when it was saved), so what the cache says about the level is not trusted. This fails closed:
 *    if the protection cannot be enabled, the document is NOT returned and the error is, so the
 *    viewer never has a location it could show unprotected;
 * 4. logs the access.
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

    const reader = await requireSameUser(this.deps, owner);
    if (isErr(reader)) return reader;

    const screenProtected =
      isConfidential(document) || loaded.value.source.freshness === FRESHNESS.Stale;
    if (screenProtected) {
      const enabled = await screenProtectionCoordinator.acquire(document.id);
      if (isErr(enabled)) return enabled;
    }

    monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.DocumentOpened, {
      [LOG_ATTRIBUTE.DocumentId]: document.id,
      [LOG_ATTRIBUTE.UserId]: reader.value.user.id,
      [LOG_ATTRIBUTE.Confidentiality]: document.confidentiality,
      [LOG_ATTRIBUTE.Freshness]: loaded.value.source.freshness,
    });

    return ok({
      document,
      location,
      watermark: createWatermark(reader.value.user, clock.now()),
      source: loaded.value.source,
      screenProtected,
    });
  }

  private load(
    owner: UserId,
    documentId: DocumentId,
  ): Promise<
    Result<Loaded<ViewableDocument>, RepositoryError | SessionRequiredError | SessionChangedError>
  > {
    const { documents, documentCache } = this.deps;

    return loadWithCacheFallback(this.deps, owner, {
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
      revoke: () => documentCache.remove(owner, documentId),
    });
  }
}
