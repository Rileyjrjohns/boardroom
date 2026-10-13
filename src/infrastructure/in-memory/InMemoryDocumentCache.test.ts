import { describeDocumentCacheContract } from '@application/testing/contracts/documentCacheContract';
import { storageWriteFailed } from '@domain/errors/StorageError';

import { InMemoryDocumentCache } from './InMemoryDocumentCache';
import { InMemoryDocumentContent } from './InMemoryDocumentContent';

describeDocumentCacheContract(
  'InMemoryDocumentCache',
  () => {
    const content = new InMemoryDocumentContent();
    const cache = new InMemoryDocumentCache(content);
    return {
      cache,
      breakWrites: () => cache.failWritesWith(storageWriteFailed()),
      repairWrites: () => cache.failWritesWith(undefined),
      files: {
        put: (location) => content.store(location),
        exists: (location) => content.has(location),
        lose: (location) => {
          content.delete(location);
        },
        breakDeletion: () => content.failDeletionWith(storageWriteFailed()),
        repairDeletion: () => content.failDeletionWith(undefined),
      },
    };
  },
  { keepsFiles: true },
);
