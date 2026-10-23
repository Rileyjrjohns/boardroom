import { IN_MEMORY_STORE } from '@core/application/testing/contracts/support';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { temporaryDirectory } from '@core/infrastructure/testing/NodeSqlite';
import { describeDocumentCacheContract } from '@features/documents/application/testing/contracts/documentCacheContract';

import { aDocumentDevice } from './testing/documentDevice';

import { InMemoryDocumentCache } from './InMemoryDocumentCache';

const parent = temporaryDirectory();

// The entries are in memory, the content is in files of a directory of the machine, behind a store
// that can be made to fail to delete.
describeDocumentCacheContract(
  'InMemoryDocumentCache',
  () => {
    const device = aDocumentDevice(parent);
    const cache = new InMemoryDocumentCache(device.store);
    return {
      cache,
      breakWrites: () => cache.failWritesWith(storageWriteFailed()),
      repairWrites: () => cache.failWritesWith(undefined),
      files: device.files,
    };
  },
  { ...IN_MEMORY_STORE, keepsFiles: true },
);
