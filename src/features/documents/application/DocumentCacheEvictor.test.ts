import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { FakeDocumentCache } from '@features/documents/application/testing/FakeDocumentCache';
import { NOW, aDocument, aDocumentId, aDocumentLocation, aUserId } from '@testing/domain/builders';

import { DocumentCacheEvictor } from './DocumentCacheEvictor';

const ALICE = aUserId('user-1');
const BRUNO = aUserId('user-2');

describe('DocumentCacheEvictor', () => {
  it('drops the copy of a document that the owner kept, and only that one', async () => {
    const cache = new FakeDocumentCache();
    const viewable = { document: aDocument(), location: aDocumentLocation() };
    await cache.save(ALICE, viewable, NOW);
    await cache.save(BRUNO, viewable, NOW);

    const evicted = await new DocumentCacheEvictor(cache).evict(ALICE, aDocumentId());

    expect(evicted).toEqual(ok(undefined));
    expect(await cache.read(ALICE, aDocumentId())).toEqual(ok(undefined));
    expect((await cache.read(BRUNO, aDocumentId())).ok).toBe(true);
    expect(cache.isEmpty()).toBe(false);
  });

  it('succeeds when the owner kept none', async () => {
    const evicted = await new DocumentCacheEvictor(new FakeDocumentCache()).evict(
      ALICE,
      aDocumentId(),
    );

    expect(evicted).toEqual(ok(undefined));
  });

  it('gives the failure of a cache that cannot be written', async () => {
    const cache = new FakeDocumentCache();
    cache.removeFailure = storageWriteFailed();

    expect(await new DocumentCacheEvictor(cache).evict(ALICE, aDocumentId())).toEqual(
      err(storageWriteFailed()),
    );
  });
});
