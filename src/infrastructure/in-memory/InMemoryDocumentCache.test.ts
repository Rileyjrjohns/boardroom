import { describeDocumentCacheContract } from '@application/testing/contracts/documentCacheContract';

import { InMemoryDocumentCache } from './InMemoryDocumentCache';
import { InMemoryDocumentContent } from './InMemoryDocumentContent';

describeDocumentCacheContract(
  'InMemoryDocumentCache',
  () => {
    const content = new InMemoryDocumentContent();
    return {
      cache: new InMemoryDocumentCache(content),
      files: {
        put: (location) => content.store(location),
        exists: (location) => content.has(location),
        lose: (location) => content.delete(location),
      },
    };
  },
  { keepsFiles: true },
);
