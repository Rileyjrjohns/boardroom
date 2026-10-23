import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { FakeDocumentCache } from '@features/documents/application/testing/FakeDocumentCache';
import { NOW, aDocument, aDocumentLocation, aUserId } from '@testing/domain/builders';

import { DocumentCachePurger } from './DocumentCachePurger';

describe('DocumentCachePurger', () => {
  it('names the documents as what it empties, for the monitoring', () => {
    expect(new DocumentCachePurger(new FakeDocumentCache()).resource).toBe(CACHE_RESOURCE.Document);
  });

  it('empties the cache of the documents, for every owner', async () => {
    const cache = new FakeDocumentCache();
    const viewable = { document: aDocument(), location: aDocumentLocation() };
    await cache.save(aUserId('user-1'), viewable, NOW);
    await cache.save(aUserId('user-2'), viewable, NOW);

    const purged = await new DocumentCachePurger(cache).purge();

    expect(purged).toEqual(ok(undefined));
    expect(cache.isEmpty()).toBe(true);
  });

  it('gives the failure of a cache that cannot be emptied', async () => {
    const cache = new FakeDocumentCache();
    cache.purgeFailure = storageWriteFailed('locked');

    expect(await new DocumentCachePurger(cache).purge()).toEqual(err(storageWriteFailed('locked')));
  });
});
