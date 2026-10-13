import type { Document } from '@domain/entities/Document';
import { networkUnavailable, notFound, unauthorized } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import { aConfidentialDocument, aDocument, aDocumentId } from '@domain/testing/builders';

import type { DocumentRepository } from '../../ports/DocumentRepository';

import { valueOf } from './support';

export interface DocumentRepositoryHarness {
  readonly repository: DocumentRepository;
  /**
   * Makes the server hold exactly these documents, all of them visible to the signed-in user, and
   * forgets the ones it held.
   */
  serve(documents: readonly Document[]): void | Promise<void>;
  setOnline(online: boolean): void;
  /** From now on the server refuses the caller: no valid credentials. */
  refuseCaller(): void | Promise<void>;
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
