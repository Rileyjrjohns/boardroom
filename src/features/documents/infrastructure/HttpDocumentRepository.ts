import type { Monitoring } from '@core/application/ports/Monitoring';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import { err } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Duration } from '@core/domain/value-objects/Duration';
import type { DocumentId } from '@core/domain/value-objects/ids';
import type { FileStore } from '@core/infrastructure/files/FileStore';
import type { HttpClient } from '@core/infrastructure/http/HttpClient';
import { asRepositoryError } from '@core/infrastructure/http/gatewayErrors';
import {
  CONTENT_VIOLATION,
  contentViolation,
  domainViolation,
  HTTP_RESOURCE,
  IDENTITY_VIOLATION,
  identityViolation,
} from '@core/infrastructure/http/invalidResponse';
import {
  HTTP_METHOD,
  MAX_DOCUMENT_BYTES,
  MEDIA_TYPE_PDF,
  ROUTES,
} from '@core/infrastructure/http/protocol';
import type { DocumentRepository } from '@features/documents/application/ports/DocumentRepository';
import type { DocumentLocation } from '@features/documents/domain/value-objects/DocumentLocation';
import type { Document } from '@features/meetings/domain/entities/Document';

import { storeDocumentContent } from './storeDocumentContent';
import { hasPdfSignature } from './pdfSignature';

import { documentSchema, toDocument } from './dto/documentDto';

/** A version is the `ETag` of the answer: visible ASCII, and short. It is only ever hashed. */
const VERSION_FORMAT = /^[\x21-\x7e]{1,256}$/;

export interface HttpDocumentRepositoryOptions {
  /** The most a document may weigh. Defaults to `MAX_DOCUMENT_BYTES`. */
  readonly maxContentBytes?: number;
  /** How long a download may take. Defaults to the timeout of the client. */
  readonly downloadTimeout?: Duration;
}

/**
 * The documents of the API: `GET /documents/{id}` for the metadata, and `GET /documents/{id}/content`
 * for the file. The metadata must be those of the document that was asked for: an answer about
 * another one is `unexpected`. The requests are given to the client as functions, so that the route, which is made
 * of an identifier, is built where the client can catch a failure: an adapter never throws.
 *
 * **Downloading.** `fetchContent` fetches the PDF through the client, which gives it the rules of
 * every other request (the token of the signed-in user read when the request is created, the
 * statuses, the redirects refused, no URL in a cause) and adds its own limits: the answer must be
 * `application/pdf` and at most `maxContentBytes`, and it has its own timeout. Then:
 *
 * - the bytes must start with `%PDF-`. A server that says `application/pdf` and sends something
 *   else (an error page, a sign-in form) is not trusted: nothing is stored and the answer is
 *   `unexpected`;
 * - the answer must carry an `ETag`, the version of the content. The file is named for the user
 *   the token belongs to, the document and the version (see `documentFileName`), so a download is
 *   never reused for somebody else nor across versions, and a document that changed is a new file;
 * - the file is written whole or not at all (`FileStore.write`), and the location of the file is
 *   what `fetchContent` answers. Asking again downloads again, and replaces the file.
 *
 * Reading from the cache when the network is down is not this adapter's business: that is the
 * offline policy of the use cases, which keep the location.
 */
export class HttpDocumentRepository implements DocumentRepository {
  constructor(
    private readonly client: HttpClient,
    private readonly monitoring: Monitoring,
    private readonly files: FileStore,
    private readonly options: HttpDocumentRepositoryOptions = {},
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
    if (!document.ok) {
      return err(domainViolation(this.monitoring, HTTP_RESOURCE.Document, document.error));
    }
    if (document.value.id !== id) {
      return err(
        identityViolation(this.monitoring, HTTP_RESOURCE.Document, IDENTITY_VIOLATION.OtherItem),
      );
    }
    return document;
  }

  async fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>> {
    const { maxContentBytes = MAX_DOCUMENT_BYTES, downloadTimeout } = this.options;
    const answer = await this.client.download(() => ({
      method: HTTP_METHOD.Get,
      path: ROUTES.documentContent(id),
      resource: HTTP_RESOURCE.DocumentContent,
      mediaType: MEDIA_TYPE_PDF,
      maxBytes: maxContentBytes,
      ...(downloadTimeout === undefined ? {} : { timeout: downloadTimeout }),
    }));
    if (!answer.ok) return err(asRepositoryError(answer.error));

    const { bytes, etag, userId } = answer.value;
    if (!hasPdfSignature(bytes)) {
      return err(
        contentViolation(
          this.monitoring,
          HTTP_RESOURCE.DocumentContent,
          CONTENT_VIOLATION.WrongSignature,
        ),
      );
    }
    if (etag === undefined || !VERSION_FORMAT.test(etag)) {
      return err(
        contentViolation(
          this.monitoring,
          HTTP_RESOURCE.DocumentContent,
          CONTENT_VIOLATION.NoVersion,
        ),
      );
    }

    return storeDocumentContent(
      { files: this.files, monitoring: this.monitoring },
      { userId, documentId: id, version: etag, bytes },
    );
  }
}
