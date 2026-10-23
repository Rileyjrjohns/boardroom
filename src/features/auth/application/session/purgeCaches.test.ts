import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { createFakes } from '@testing/application/createFakes';
import { NOW, aDocument, aDocumentLocation, aMeeting, aUserId } from '@testing/domain/builders';

import { purgeCaches } from './purgeCaches';

async function fill(fakes: ReturnType<typeof createFakes>) {
  await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
  await fakes.documentCache.save(
    aUserId(),
    { document: aDocument(), location: aDocumentLocation() },
    NOW,
  );
}

describe('purgeCaches', () => {
  it('empties the meeting cache and the document cache', async () => {
    const fakes = createFakes();
    await fill(fakes);

    await purgeCaches(fakes);

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
    expect(fakes.monitoring.errors).toEqual([]);
  });

  it('still empties the document cache when the meeting cache cannot be emptied, and captures it', async () => {
    const fakes = createFakes();
    await fill(fakes);
    fakes.meetingCache.purgeFailure = storageWriteFailed();

    await purgeCaches(fakes);

    expect(fakes.documentCache.isEmpty()).toBe(true);
    expect(fakes.monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.CachePurgeFailed,
        error: storageWriteFailed(),
        attributes: { [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting },
      },
    ]);
  });

  it('still empties the meeting cache when the document cache cannot be emptied, and captures it', async () => {
    const fakes = createFakes();
    await fill(fakes);
    fakes.documentCache.purgeFailure = storageWriteFailed('content locked');

    await purgeCaches(fakes);

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.CachePurgeFailed,
        error: storageWriteFailed('content locked'),
        attributes: { [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Document },
      },
    ]);
  });
});
