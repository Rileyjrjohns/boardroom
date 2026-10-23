import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { createFakes } from '@testing/application/createFakes';
import { NOW, aDocument, aDocumentLocation, aMeeting, aUserId } from '@testing/domain/builders';

import type { SessionDataPurger } from '../ports/SessionDataPurger';

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

/** A purger of a feature that nothing in `auth` knows: it records the order it was called in. */
function aPurger(
  resource: SessionDataPurger['resource'],
  calls: string[],
  outcome: Result<void, StorageWriteFailedError> = ok(undefined),
): SessionDataPurger {
  return {
    resource,
    purge: () => {
      calls.push(resource);
      return Promise.resolve(outcome);
    },
  };
}

describe('purgeCaches, over the purgers it is given', () => {
  it('runs them in the order of the list, which the composition decides', async () => {
    const calls: string[] = [];
    const monitoring = new FakeMonitoring();

    await purgeCaches({
      monitoring,
      sessionDataPurgers: [
        aPurger(CACHE_RESOURCE.Document, calls),
        aPurger(CACHE_RESOURCE.Meeting, calls),
      ],
    });

    expect(calls).toEqual([CACHE_RESOURCE.Document, CACHE_RESOURCE.Meeting]);
    expect(monitoring.errors).toEqual([]);
  });

  it('attempts every purger, whatever the one before it did, and names the resource that failed', async () => {
    const calls: string[] = [];
    const monitoring = new FakeMonitoring();

    await purgeCaches({
      monitoring,
      sessionDataPurgers: [
        aPurger(CACHE_RESOURCE.Meeting, calls, err(storageWriteFailed('first'))),
        aPurger(CACHE_RESOURCE.Document, calls, err(storageWriteFailed('second'))),
      ],
    });

    expect(calls).toEqual([CACHE_RESOURCE.Meeting, CACHE_RESOURCE.Document]);
    expect(monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.CachePurgeFailed,
        error: storageWriteFailed('first'),
        attributes: { [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting },
      },
      {
        event: MONITORING_EVENT.CachePurgeFailed,
        error: storageWriteFailed('second'),
        attributes: { [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Document },
      },
    ]);
  });

  it('does nothing, and fails nothing, when no feature keeps data for a user', async () => {
    const monitoring = new FakeMonitoring();

    await purgeCaches({ monitoring, sessionDataPurgers: [] });

    expect(monitoring.errors).toEqual([]);
  });
});
