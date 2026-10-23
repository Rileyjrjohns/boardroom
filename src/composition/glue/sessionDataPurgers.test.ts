import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { FakeDocumentCache } from '@features/documents/application/testing/FakeDocumentCache';
import { FakeMeetingCache } from '@features/meetings/application/testing/FakeMeetingCache';
import { NOW, aDocument, aDocumentLocation, aMeeting, aUserId } from '@testing/domain/builders';

import { sessionDataPurgers } from './sessionDataPurgers';

describe('sessionDataPurgers', () => {
  it('is one purger for each feature that keeps data for a user: the meetings, then the documents', () => {
    const purgers = sessionDataPurgers({
      meetingCache: new FakeMeetingCache(),
      documentCache: new FakeDocumentCache(),
    });

    expect(purgers.map(({ resource }) => resource)).toEqual([
      CACHE_RESOURCE.Meeting,
      CACHE_RESOURCE.Document,
    ]);
  });

  it('empties the cache of each feature', async () => {
    const meetingCache = new FakeMeetingCache();
    const documentCache = new FakeDocumentCache();
    await meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
    await documentCache.save(
      aUserId(),
      { document: aDocument(), location: aDocumentLocation() },
      NOW,
    );

    for (const purger of sessionDataPurgers({ meetingCache, documentCache })) {
      expect((await purger.purge()).ok).toBe(true);
    }

    expect(meetingCache.isEmpty()).toBe(true);
    expect(documentCache.isEmpty()).toBe(true);
  });
});
