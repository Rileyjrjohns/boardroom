import type { Document } from '@domain/entities/Document';
import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
} from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import { aConfidentialDocument, aDocument, aDocumentId, aUserId } from '@domain/testing/builders';
import type { UserId } from '@domain/value-objects/ids';

import type { DocumentRepository } from '../../ports/DocumentRepository';

import { valueOf } from './support';

export interface DocumentRepositoryHarness {
  readonly repository: DocumentRepository;
  /**
   * Makes the server hold exactly these documents, all of them visible to the signed-in user, and
   * forgets the ones it held.
   */
  serve(documents: readonly Document[]): void | Promise<void>;
  /** Makes the server hold this document as one the signed-in user may not have. */
  forbid(document: Document): void | Promise<void>;
  /**
   * From now on the requests are authenticated as this user, who is allowed the documents that
   * `serve` put on the server, like the first user.
   */
  signInAs(userId: UserId): void | Promise<void>;
  setOnline(online: boolean): void;
  /** From now on the server refuses the caller: no valid credentials. */
  refuseCaller(): void | Promise<void>;
}

export interface DocumentRepositoryContractOptions {
  /**
   * Whether the adapter downloads a document once per user and per version, so that a location is
   * never shared by two users nor kept across versions. The scripted server of the fakes, whose
   * locations are given by the test, cannot.
   */
  readonly downloadsPerUserAndVersion: boolean;
}

export type DocumentRepositoryFactory = () =>
  DocumentRepositoryHarness | Promise<DocumentRepositoryHarness>;

const INTERNAL = aDocument();
const CONFIDENTIAL = aConfidentialDocument({
  id: aDocumentId('document-2'),
  title: 'Remuneration report',
});
const UNKNOWN = aDocumentId('does-not-exist');

/**
 * The contract of `DocumentRepository`, as a suite any implementation runs: metadata by id,
 * `notFound` for an unknown document, a location for the content that can be asked for twice, and
 * failures that are results.
 */
export function describeDocumentRepositoryContract(
  name: string,
  createHarness: DocumentRepositoryFactory,
  options: DocumentRepositoryContractOptions,
): void {
  describe(`${name} honours the DocumentRepository contract`, () => {
    let harness: DocumentRepositoryHarness;
    let repository: DocumentRepository;

    beforeEach(async () => {
      harness = await createHarness();
      repository = harness.repository;
      await harness.serve([INTERNAL, CONFIDENTIAL]);
    });

    it('returns the metadata of a document', async () => {
      expect(await repository.get(INTERNAL.id)).toStrictEqual(ok(INTERNAL));
      expect(await repository.get(CONFIDENTIAL.id)).toStrictEqual(ok(CONFIDENTIAL));
    });

    it('answers notFound for a document the server does not hold', async () => {
      expect(await repository.get(UNKNOWN)).toStrictEqual(err(notFound()));
      expect(await repository.fetchContent(UNKNOWN)).toStrictEqual(err(notFound()));
    });

    it('makes the content readable and says where', async () => {
      const location = valueOf(await repository.fetchContent(INTERNAL.id));

      expect(typeof location).toBe('string');
      expect(location.trim()).not.toBe('');
    });

    it('gives each document its own location', async () => {
      const first = valueOf(await repository.fetchContent(INTERNAL.id));
      const second = valueOf(await repository.fetchContent(CONFIDENTIAL.id));

      expect(first).not.toBe(second);
    });

    it('can be asked for the content of the same document twice, and says where both times', async () => {
      const first = await repository.fetchContent(INTERNAL.id);
      const second = await repository.fetchContent(INTERNAL.id);

      expect(first.ok).toBe(true);
      expect(second).toStrictEqual(first);
    });

    it('refuses a document the user may not have with forbidden, for the metadata and for the content', async () => {
      const hidden = aConfidentialDocument({ id: aDocumentId('hidden'), title: 'Restricted' });
      await harness.forbid(hidden);

      expect(await repository.get(hidden.id)).toStrictEqual(err(forbidden()));
      expect(await repository.fetchContent(hidden.id)).toStrictEqual(err(forbidden()));
      expect((await repository.get(INTERNAL.id)).ok).toBe(true);
    });

    // An adapter that cannot download once per user and version skips these: they show as skipped.
    (options.downloadsPerUserAndVersion ? describe : describe.skip)('the downloads', () => {
      it('gives two users two locations: a download is never reused for somebody else', async () => {
        const first = valueOf(await repository.fetchContent(INTERNAL.id));

        await harness.signInAs(aUserId('user-2'));
        const second = valueOf(await repository.fetchContent(INTERNAL.id));

        expect(second).not.toBe(first);
      });

      it('gives the same user the same location for the same version of a document', async () => {
        const first = valueOf(await repository.fetchContent(INTERNAL.id));
        const second = valueOf(await repository.fetchContent(INTERNAL.id));

        expect(second).toBe(first);
      });

      it('gives a new version of a document a new location: a download is never reused across versions', async () => {
        const first = valueOf(await repository.fetchContent(INTERNAL.id));

        await harness.serve([{ ...INTERNAL, pageCount: INTERNAL.pageCount + 1 }, CONFIDENTIAL]);
        const second = valueOf(await repository.fetchContent(INTERNAL.id));

        expect(second).not.toBe(first);
      });
    });

    it('answers networkUnavailable without a connection, and recovers with it', async () => {
      harness.setOnline(false);

      expect(await repository.get(INTERNAL.id)).toStrictEqual(err(networkUnavailable()));
      expect(await repository.fetchContent(INTERNAL.id)).toStrictEqual(err(networkUnavailable()));

      harness.setOnline(true);
      expect((await repository.get(INTERNAL.id)).ok).toBe(true);
      expect((await repository.fetchContent(INTERNAL.id)).ok).toBe(true);
    });

    it('answers unauthorized when the caller is refused', async () => {
      await harness.refuseCaller();

      expect(await repository.get(INTERNAL.id)).toStrictEqual(err(unauthorized()));
      expect(await repository.fetchContent(INTERNAL.id)).toStrictEqual(err(unauthorized()));
    });
  });
}
