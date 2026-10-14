import type { Document } from '@domain/entities/Document';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { err } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId } from '@domain/value-objects/ids';
import type { Monitoring } from '@application/ports/Monitoring';
import type { DocumentRepository } from '@application/ports/DocumentRepository';

import {
  documentContentSchema,
  documentSchema,
  toDocument,
  toDocumentLocation,
} from './dto/documentDto';
import { asRepositoryError } from './gatewayErrors';
import type { HttpClient } from './HttpClient';
import { domainViolation, HTTP_RESOURCE } from './invalidResponse';
import { HTTP_METHOD, ROUTES } from './protocol';

/**
 * The files of the device, as far as this adapter goes: where a location it hands out now holds
 * content. The document cache reads the same register to know whether an entry still points at
 * something (see `InMemoryDocumentContent`, which is one).
 */
export interface DownloadedContent {
  store(location: DocumentLocation): void;
}

/**
 * The documents of the API (`GET /documents/{id}` and `GET /documents/{id}/content`). The server
 * answers with the location of the content, per user and per version of the document. Downloading
 * it to the private storage of the app is the job of the step that adds the document viewer: until
 * then the location is registered as downloaded, which is what the in-memory repository does. The
 * requests are given to the client as functions, so that the route, which is made of an
 * identifier, is built where the client can catch a failure: an adapter never throws.
 */
export class HttpDocumentRepository implements DocumentRepository {
  constructor(
    private readonly client: HttpClient,
    private readonly monitoring: Monitoring,
    private readonly content: DownloadedContent,
  ) {}

  async get(id: DocumentId): Promise<Result<Document, RepositoryError>> {
    const answer = await this.client.request(() => ({
      method: HTTP_METHOD.Get,
      path: ROUTES.document(id),
      resource: HTTP_RESOURCE.Document,
      schema: documentSchema,
    }));
    if (!answer.ok) return err(asRepositoryError(answer.error));

    const document = toDocument(answer.value);
    return document.ok
      ? document
      : err(domainViolation(this.monitoring, HTTP_RESOURCE.Document, document.error));
  }

  async fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>> {
    const answer = await this.client.request(() => ({
      method: HTTP_METHOD.Get,
      path: ROUTES.documentContent(id),
      resource: HTTP_RESOURCE.DocumentContent,
      schema: documentContentSchema,
    }));
    if (!answer.ok) return err(asRepositoryError(answer.error));

    const location = toDocumentLocation(answer.value);
    if (!location.ok) {
      return err(domainViolation(this.monitoring, HTTP_RESOURCE.DocumentContent, location.error));
    }
    this.content.store(location.value);
    return location;
  }
}
