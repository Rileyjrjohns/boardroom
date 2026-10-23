import { TRICKY_IDS, mutable } from '@core/application/testing/contracts/support';
import type { StoreContractOptions } from '@core/application/testing/contracts/support';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { ok } from '@core/domain/shared/Result';
import type { DocumentLocation } from '@features/documents/domain/value-objects/DocumentLocation';
import {
  NOW,
  aConfidentialDocument,
  aDocument,
  aDocumentId,
  aDocumentLocation,
  aUserId,
  at,
} from '@testing/domain/builders';

import type { DocumentCache, ViewableDocument } from '../../ports/DocumentCache';

/**
 * The files of the device, as far as the contract needs them. Content lives outside the cache, at
 * a location the repository produced, so a test must be able to put some there, to see whether it
 * is still there, and to lose it behind the cache's back (the file was deleted, the storage was
 * cleared). An adapter that keeps no files cannot offer this, and the checks about content are
 * skipped for it (`keepsFiles: false`).
 */
export interface DocumentFiles {
  /** Puts content at the location, as a download would. */
  put(location: DocumentLocation): void | Promise<void>;
  exists(location: DocumentLocation): boolean | Promise<boolean>;
  /** Removes the content without telling the cache. */
  lose(location: DocumentLocation): void | Promise<void>;
  /** From now on a file cannot be deleted (a locked file, a failing disk). */
  breakDeletion(): void;
  repairDeletion(): void;
}

export interface DocumentCacheHarness {
  readonly cache: DocumentCache;
  readonly files?: DocumentFiles;
  /** From now on every `save` fails with a storage error. */
  breakWrites(): void;
  repairWrites(): void;
  /**
   * Makes the next statement the store sends to its storage fail, once. Only a store that has a
   * storage to fail provides it (`StoreContractOptions.failsStatements`).
   */
  failNextStatement?(): void;
  /**
   * Closes the store and opens it again on the same storage and the same files, as a new start of
   * the app would, and returns the new one. Only a store whose content survives provides it
   * (`StoreContractOptions.survivesReopen`).
   */
  reopen?(): Promise<DocumentCache>;
}

/** What the suite needs to know of an implementation: its files, and the storage it keeps them in. */
export interface DocumentCacheContractOptions extends StoreContractOptions {
  /** Whether the adapter keeps files, so that the checks on the content can run. */
  readonly keepsFiles: boolean;
}

export type DocumentCacheFactory = () => DocumentCacheHarness | Promise<DocumentCacheHarness>;

const OWNER = aUserId('owner-1');
const OTHER_OWNER = aUserId('owner-2');

/**
 * A text as the hexadecimal digits of its UTF-16 code units: one name per text, whatever it
 * contains, in characters that every file system keeps apart (no separator, and no letter whose
 * case could make two names one). The locations of the suite are file names in the directory a
 * real store keeps its files in.
 */
function hexOf(text: string): string {
  return Array.from(text, (character) =>
    character.charCodeAt(0).toString(16).padStart(4, '0'),
  ).join('');
}

const VIEWABLE: ViewableDocument = { document: aDocument(), location: aDocumentLocation() };
const OTHER_VIEWABLE: ViewableDocument = {
  document: aConfidentialDocument({ id: aDocumentId('document-2'), title: 'Remuneration report' }),
  location: aDocumentLocation('file:///documents/document-2.pdf'),
};

/**
 * The contract of `DocumentCache`, as a suite any implementation runs. On top of what a meeting
 * cache promises (owners kept apart, a miss is a value, idempotent `save` and `remove`, no
 * reference kept to what goes in or out), `remove` and `purge` delete the stored content too, and
 * an entry whose content is gone is a miss.
 */
export function describeDocumentCacheContract(
  name: string,
  createHarness: DocumentCacheFactory,
  options: DocumentCacheContractOptions,
): void {
  describe(`${name} honours the DocumentCache contract`, () => {
    let harness: DocumentCacheHarness;
    let cache: DocumentCache;

    /** A download: the content is on the device before the cache is told about it. */
    async function download(viewable: ViewableDocument): Promise<ViewableDocument> {
      await harness.files?.put(viewable.location);
      return viewable;
    }

    beforeEach(async () => {
      harness = await createHarness();
      cache = harness.cache;
    });

    it('answers a miss with a successful undefined, never an error', async () => {
      expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
    });

    it('gives back a document and its location as saved, with the instant it was saved at', async () => {
      await download(VIEWABLE);

      expect(await cache.save(OWNER, VIEWABLE, at(10))).toStrictEqual(ok(undefined));

      expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
        ok({ value: VIEWABLE, cachedAt: at(10) }),
      );
    });

    it('replaces what is stored for the same owner and document', async () => {
      await download(VIEWABLE);
      const moved = { ...VIEWABLE, location: aDocumentLocation('file:///documents/moved.pdf') };
      await download(moved);

      await cache.save(OWNER, VIEWABLE, at(10));
      await cache.save(OWNER, moved, at(11));

      expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
        ok({ value: moved, cachedAt: at(11) }),
      );
    });

    it('tells documents apart by id', async () => {
      await download(VIEWABLE);
      await download(OTHER_VIEWABLE);
      await cache.save(OWNER, VIEWABLE, at(10));
      await cache.save(OWNER, OTHER_VIEWABLE, at(11));

      expect(await cache.read(OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
        ok({ value: OTHER_VIEWABLE, cachedAt: at(11) }),
      );
      expect(await cache.read(OWNER, aDocumentId('document-3'))).toStrictEqual(ok(undefined));
    });

    it('keeps the entries of two owners apart: an owner reads a miss where another saved', async () => {
      await download(VIEWABLE);
      await cache.save(OWNER, VIEWABLE, at(10));

      expect(await cache.read(OTHER_OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
    });

    it('does not let one owner overwrite the entry of another', async () => {
      await download(VIEWABLE);
      await download(OTHER_VIEWABLE);
      await cache.save(OWNER, VIEWABLE, at(10));
      await cache.save(OTHER_OWNER, { ...VIEWABLE, document: OTHER_VIEWABLE.document }, at(11));
      await cache.save(OTHER_OWNER, VIEWABLE, at(12));

      expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
        ok({ value: VIEWABLE, cachedAt: at(10) }),
      );
    });

    it('removes one entry and leaves the others, and succeeds when the entry is absent', async () => {
      await download(VIEWABLE);
      await download(OTHER_VIEWABLE);
      await cache.save(OWNER, VIEWABLE, at(10));
      await cache.save(OWNER, OTHER_VIEWABLE, at(11));

      expect(await cache.remove(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      expect(await cache.remove(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      expect(await cache.remove(OTHER_OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
        ok(undefined),
      );

      expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      expect(await cache.read(OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
        ok({ value: OTHER_VIEWABLE, cachedAt: at(11) }),
      );
    });

    it('purges every entry of every owner, and succeeds when there is none', async () => {
      expect(await cache.purge()).toStrictEqual(ok(undefined));
      await download(VIEWABLE);
      await download(OTHER_VIEWABLE);
      await cache.save(OWNER, VIEWABLE, at(10));
      await cache.save(OTHER_OWNER, OTHER_VIEWABLE, at(11));

      expect(await cache.purge()).toStrictEqual(ok(undefined));

      expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      expect(await cache.read(OTHER_OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
        ok(undefined),
      );
      expect(await cache.purge()).toStrictEqual(ok(undefined));
    });

    describe('a save that fails', () => {
      it('does not leave the older entry readable as if it were current', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        harness.breakWrites();

        const failed = await cache.save(
          OWNER,
          { ...VIEWABLE, document: aDocument({ title: 'Newer' }) },
          at(11),
        );
        harness.repairWrites();

        expect(failed.ok).toBe(false);
        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      });

      it('leaves the entries of the other documents and owners alone', async () => {
        await download(VIEWABLE);
        await download(OTHER_VIEWABLE);
        await cache.save(OWNER, OTHER_VIEWABLE, at(10));
        await cache.save(OTHER_OWNER, VIEWABLE, at(11));
        await cache.save(OWNER, VIEWABLE, at(12));
        harness.breakWrites();

        await cache.save(OWNER, VIEWABLE, at(13));
        harness.repairWrites();

        expect(await cache.read(OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
          ok({ value: OTHER_VIEWABLE, cachedAt: at(10) }),
        );
        expect(await cache.read(OTHER_OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(11) }),
        );
      });
    });

    describe('the storage key is injective in the owner and the document id', () => {
      it('never mixes up two pairs of (owner, document id), whatever characters they contain', async () => {
        const pairs = TRICKY_IDS.flatMap((owner) => TRICKY_IDS.map((id) => [owner, id] as const));
        const viewableOf = (owner: string, id: string): ViewableDocument => ({
          document: aDocument({ id: aDocumentId(id), title: JSON.stringify([owner, id]) }),
          location: aDocumentLocation(`file:///documents/${hexOf(owner)}-${hexOf(id)}.pdf`),
        });
        for (const [owner, id] of pairs) {
          const viewable = await download(viewableOf(owner, id));
          await cache.save(aUserId(owner), viewable, at(1));
        }

        for (const [owner, id] of pairs) {
          const read = await cache.read(aUserId(owner), aDocumentId(id));
          expect(read.ok && read.value?.value.document.title).toBe(JSON.stringify([owner, id]));
        }
      });
    });

    describe('keeps no reference to the objects that go in or out', () => {
      it('is not changed by a change of the document after it was saved', async () => {
        const saved = { document: aDocument(), location: aDocumentLocation() };
        await download(saved);
        await cache.save(OWNER, saved, NOW);

        mutable(saved.document).title = 'DEFACED';
        mutable(saved.document).pageCount = 999;
        mutable(saved).location = aDocumentLocation('file:///documents/defaced.pdf');

        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: NOW }),
        );
      });

      it('is not changed by a change of the document after it was read', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, NOW);
        const read = await cache.read(OWNER, VIEWABLE.document.id);

        if (read.ok && read.value !== undefined) {
          mutable(read.value.value.document).title = 'DEFACED';
          mutable(read.value.value).location = aDocumentLocation('file:///documents/defaced.pdf');
          mutable(read.value).cachedAt = at(999);
        }

        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: NOW }),
        );
      });
    });

    // A store without a storage to fail, or with nothing to reopen, skips these: they show as skipped.
    (options.failsStatements ? describe : describe.skip)('a statement that fails', () => {
      const failNext = () => {
        if (harness.failNextStatement === undefined)
          throw new Error('The harness cannot fail a statement.');
        harness.failNextStatement();
      };

      it('turns a read that fails into a storage error, and finds the entry again afterwards', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));

        failNext();
        const failed = await cache.read(OWNER, VIEWABLE.document.id);

        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.ReadFailed);
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(10) }),
        );
      });

      it('turns a save that fails into a storage error, and leaves no older entry readable', async () => {
        await download(VIEWABLE);
        await download(OTHER_VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OWNER, OTHER_VIEWABLE, at(11));

        failNext();
        const failed = await cache.save(
          OWNER,
          { ...VIEWABLE, document: aDocument({ title: 'Newer' }) },
          at(12),
        );

        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
        expect(await cache.read(OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
          ok({ value: OTHER_VIEWABLE, cachedAt: at(11) }),
        );
      });

      it('turns a removal that fails into a storage error, and keeps the entry', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));

        failNext();
        const failed = await cache.remove(OWNER, VIEWABLE.document.id);

        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(10) }),
        );
      });

      it('turns a purge that fails into a storage error, and keeps every entry, none half removed', async () => {
        await download(VIEWABLE);
        await download(OTHER_VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OTHER_OWNER, OTHER_VIEWABLE, at(11));

        failNext();
        const failed = await cache.purge();

        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(10) }),
        );
        expect(await cache.read(OTHER_OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
          ok({ value: OTHER_VIEWABLE, cachedAt: at(11) }),
        );
        expect(await cache.purge()).toStrictEqual(ok(undefined));
      });

      it('fails once and no more: the next call works', async () => {
        await download(VIEWABLE);

        failNext();
        await cache.save(OWNER, VIEWABLE, at(10));

        expect(await cache.save(OWNER, VIEWABLE, at(11))).toStrictEqual(ok(undefined));
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(11) }),
        );
      });
    });

    (options.survivesReopen ? describe : describe.skip)('closed and opened again', () => {
      const reopen = async (): Promise<DocumentCache> => {
        if (harness.reopen === undefined) throw new Error('The harness cannot reopen the store.');
        return harness.reopen();
      };

      it('gives back the documents of every owner as they were, with their locations and their instants', async () => {
        await download(VIEWABLE);
        await download(OTHER_VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OTHER_OWNER, OTHER_VIEWABLE, at(11));

        const reopened = await reopen();

        expect(await reopened.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(10) }),
        );
        expect(await reopened.read(OTHER_OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
          ok({ value: OTHER_VIEWABLE, cachedAt: at(11) }),
        );
        expect(await reopened.read(OTHER_OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      });

      it('does not give back what was removed before it was closed', async () => {
        await download(VIEWABLE);
        await download(OTHER_VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OWNER, OTHER_VIEWABLE, at(11));
        await cache.remove(OWNER, VIEWABLE.document.id);

        const reopened = await reopen();

        expect(await reopened.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
        expect(await reopened.read(OWNER, OTHER_VIEWABLE.document.id)).toStrictEqual(
          ok({ value: OTHER_VIEWABLE, cachedAt: at(11) }),
        );
      });

      it('does not give back what was purged before it was closed', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.purge();

        const reopened = await reopen();

        expect(await reopened.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      });
    });

    describe('writers at the same time', () => {
      it('leaves one complete version of an entry when several saves of it run together', async () => {
        await download(VIEWABLE);
        const versions = [1, 2, 3, 4, 5, 6].map((number) => ({
          viewable: { ...VIEWABLE, document: aDocument({ title: `Version ${number}` }) },
          cachedAt: at(number),
        }));

        await Promise.all(
          versions.map(({ viewable, cachedAt }) => cache.save(OWNER, viewable, cachedAt)),
        );

        const read = await cache.read(OWNER, VIEWABLE.document.id);
        const held = read.ok ? read.value : undefined;
        expect(
          versions.map(({ viewable, cachedAt }) => ({ value: viewable, cachedAt })),
        ).toContainEqual(held);
      });

      it('keeps every entry when saves of different documents run together', async () => {
        const documents = [1, 2, 3, 4, 5].map((number) => ({
          document: aDocument({ id: aDocumentId(`d-${number}`), title: `Document ${number}` }),
          location: aDocumentLocation(`file:///documents/d-${number}.pdf`),
        }));
        for (const viewable of documents) await download(viewable);

        await Promise.all(
          documents.map((viewable, number) => cache.save(OWNER, viewable, at(number))),
        );

        for (const [number, viewable] of documents.entries()) {
          expect(await cache.read(OWNER, viewable.document.id)).toStrictEqual(
            ok({ value: viewable, cachedAt: at(number) }),
          );
        }
      });

      it('leaves nothing, or one complete version, when a save, a removal and reads run together', async () => {
        await download(VIEWABLE);

        const answers = await Promise.all([
          cache.save(OWNER, VIEWABLE, at(1)),
          cache.read(OWNER, VIEWABLE.document.id),
          cache.remove(OWNER, VIEWABLE.document.id),
          cache.save(OWNER, { ...VIEWABLE, document: aDocument({ title: 'Newer' }) }, at(2)),
          cache.read(OWNER, VIEWABLE.document.id),
          cache.purge(),
        ]);

        expect(answers.every((answer) => answer.ok)).toBe(true);
        const read = await cache.read(OWNER, VIEWABLE.document.id);
        const held = read.ok ? read.value : undefined;
        expect([undefined, 'Newer', VIEWABLE.document.title]).toContain(held?.value.document.title);
      });
    });

    // An adapter that keeps no files (the fakes) skips these checks: they show as skipped.
    (options.keepsFiles ? describe : describe.skip)('answers for the content', () => {
      /** The files of the device: the harness of an adapter that keeps them offers them. */
      function filesOf(): DocumentFiles {
        if (harness.files === undefined) throw new Error('The harness offers no files.');
        return harness.files;
      }

      it('reads a miss when the stored content is gone, never a location that points nowhere', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));

        await filesOf().lose(VIEWABLE.location);

        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
      });

      it('deletes the content of an entry it removes', async () => {
        await download(VIEWABLE);
        await download(OTHER_VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OWNER, OTHER_VIEWABLE, at(11));

        await cache.remove(OWNER, VIEWABLE.document.id);

        expect(await filesOf().exists(VIEWABLE.location)).toBe(false);
        expect(await filesOf().exists(OTHER_VIEWABLE.location)).toBe(true);
      });

      it('deletes the content of every entry of every owner on purge', async () => {
        await download(VIEWABLE);
        await download(OTHER_VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OTHER_OWNER, OTHER_VIEWABLE, at(11));

        await cache.purge();

        expect(await filesOf().exists(VIEWABLE.location)).toBe(false);
        expect(await filesOf().exists(OTHER_VIEWABLE.location)).toBe(false);
      });

      it('deletes the previous content when a save moves an entry to another location, so that nothing is left behind', async () => {
        const moved = { ...VIEWABLE, location: aDocumentLocation('file:///documents/moved.pdf') };
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await download(moved);

        await cache.save(OWNER, moved, at(11));

        expect(await filesOf().exists(VIEWABLE.location)).toBe(false);
        expect(await filesOf().exists(moved.location)).toBe(true);

        await cache.remove(OWNER, VIEWABLE.document.id);
        expect(await filesOf().exists(moved.location)).toBe(false);
        expect(await filesOf().exists(VIEWABLE.location)).toBe(false);
      });

      it('keeps the previous content when another owner still has an entry that points at it', async () => {
        const moved = { ...VIEWABLE, location: aDocumentLocation('file:///documents/moved.pdf') };
        await download(VIEWABLE);
        await download(moved);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OTHER_OWNER, VIEWABLE, at(11));

        await cache.save(OWNER, moved, at(12));

        expect(await filesOf().exists(VIEWABLE.location)).toBe(true);
        expect(await cache.read(OTHER_OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(11) }),
        );
      });

      it('deletes the content before the entry: when the file cannot be deleted, remove fails and nothing is reported as deleted', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        filesOf().breakDeletion();

        const failed = await cache.remove(OWNER, VIEWABLE.document.id);

        expect(failed.ok).toBe(false);
        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await filesOf().exists(VIEWABLE.location)).toBe(true);
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(10) }),
        );

        filesOf().repairDeletion();
        expect(await cache.remove(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
        expect(await filesOf().exists(VIEWABLE.location)).toBe(false);
      });

      it('purge fails too when a file cannot be deleted, keeps what it could not delete, and finishes on a second call', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        filesOf().breakDeletion();

        const failed = await cache.purge();

        expect(failed.ok).toBe(false);
        expect(await filesOf().exists(VIEWABLE.location)).toBe(true);
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(10) }),
        );

        filesOf().repairDeletion();
        expect(await cache.purge()).toStrictEqual(ok(undefined));
        expect(await cache.read(OWNER, VIEWABLE.document.id)).toStrictEqual(ok(undefined));
        expect(await filesOf().exists(VIEWABLE.location)).toBe(false);
      });

      it('keeps a file while another owner still has an entry that points at it', async () => {
        await download(VIEWABLE);
        await cache.save(OWNER, VIEWABLE, at(10));
        await cache.save(OTHER_OWNER, VIEWABLE, at(11));

        await cache.remove(OWNER, VIEWABLE.document.id);

        expect(await cache.read(OTHER_OWNER, VIEWABLE.document.id)).toStrictEqual(
          ok({ value: VIEWABLE, cachedAt: at(11) }),
        );
        expect(await filesOf().exists(VIEWABLE.location)).toBe(true);

        await cache.remove(OTHER_OWNER, VIEWABLE.document.id);
        expect(await filesOf().exists(VIEWABLE.location)).toBe(false);
      });
    });
  });
}
