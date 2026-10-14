import { describeDocumentCacheContract } from '@application/testing/contracts/documentCacheContract';
import { IN_MEMORY_STORE } from '@application/testing/contracts/support';
import { storageWriteFailed } from '@domain/errors/StorageError';

import { aDocumentDevice } from '../testing/documentDevice';
import { temporaryDirectory } from '../testing/NodeSqlite';

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
