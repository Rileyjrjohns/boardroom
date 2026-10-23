import { FakeClock } from '@core/application/testing/FakeClock';
import { FakeConnectivity } from '@core/application/testing/FakeConnectivity';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { FakeNetwork } from '@core/application/testing/FakeNetwork';
import { MeetingCacheVoteRecorder } from '@composition/glue/MeetingCacheVoteRecorder';
import { sessionDataPurgers } from '@composition/glue/sessionDataPurgers';
import { AppLock } from '@features/auth/application/session/AppLock';
import { AuthSessionGate } from '@features/auth/application/session/AuthSessionGate';
import { FakeAuthSession } from '@features/auth/application/testing/FakeAuthSession';
import { FakeBiometricGate } from '@features/auth/application/testing/FakeBiometricGate';
import { DocumentCacheEvictor } from '@features/documents/application/DocumentCacheEvictor';
import { ScreenProtectionCoordinator } from '@features/documents/application/ScreenProtectionCoordinator';
import { FakeDocumentCache } from '@features/documents/application/testing/FakeDocumentCache';
import { FakeDocumentRepository } from '@features/documents/application/testing/FakeDocumentRepository';
import { FakeScreenProtection } from '@features/documents/application/testing/FakeScreenProtection';
import { FakeMeetingCache } from '@features/meetings/application/testing/FakeMeetingCache';
import { FakeMeetingRepository } from '@features/meetings/application/testing/FakeMeetingRepository';
import { FakeVoteOutbox } from '@features/votes/application/testing/FakeVoteOutbox';
import { FakeVoteRepository } from '@features/votes/application/testing/FakeVoteRepository';
import type { DocumentCache } from '@features/documents/application/ports/DocumentCache';
import type { MeetingCache } from '@features/meetings/application/ports/MeetingCache';
import { aDuration, MILLIS_PER_DAY } from '@testing/domain/builders';

/**
 * One fake of every port, wired together: the remote fakes share `network`. The property names are
 * those of the `deps` objects of the use cases, so the whole set can be passed to any of them:
 * `new CastVote(createFakes())`. The user is signed in, the network is up, the clock stands at
 * `NOW`, the app is unlocked, the biometrics succeed and the screen protection is available. It also carries the values
 * of the configuration the use cases take in their deps: `maxCacheAge` (7 days) and `maxAttempts`
 * (5), and the objects that link the features (`sessionDataPurgers`, `sessionGate`,
 * `documentEvictor` and `recordedVoteSink`), built from the same glue as the app's.
 */
export function createFakes() {
  const network = new FakeNetwork();
  const clock = new FakeClock();
  const appLock = new AppLock({ locked: false });
  const monitoring = new FakeMonitoring();
  const auth = new FakeAuthSession();
  const screenProtection = new FakeScreenProtection();
  const meetingCache = new FakeMeetingCache();
  const documentCache = new FakeDocumentCache();
  // The links between the features are the ones of the app: the same glue, over the fakes.
  const session = {
    auth,
    clock,
    appLock,
    monitoring,
    sessionDataPurgers: sessionDataPurgers({ meetingCache, documentCache }),
  };
  return {
    network,
    clock,
    appLock,
    monitoring,
    auth,
    biometricGate: new FakeBiometricGate(),
    connectivity: new FakeConnectivity(),
    screenProtection,
    screenProtectionCoordinator: new ScreenProtectionCoordinator({ screenProtection }),
    maxCacheAge: aDuration(7 * MILLIS_PER_DAY),
    maxAttempts: 5,
    meetings: new FakeMeetingRepository(network),
    meetingCache,
    documents: new FakeDocumentRepository(network),
    documentCache,
    votes: new FakeVoteRepository(network, auth),
    outbox: new FakeVoteOutbox(),
    sessionDataPurgers: session.sessionDataPurgers,
    sessionGate: new AuthSessionGate(session),
    documentEvictor: new DocumentCacheEvictor(documentCache),
    recordedVoteSink: new MeetingCacheVoteRecorder(meetingCache, session),
  };
}

/** The caches a test may put in place of the fakes: the real ones, or ones that hold their answers. */
export interface CacheOverrides {
  readonly meetingCache?: MeetingCache;
  readonly documentCache?: DocumentCache;
}

/**
 * The same fakes over other caches. The links between the features are built from the caches
 * (`sessionDataPurgers`, `documentEvictor`, `recordedVoteSink`), so putting a cache in place of
 * the fake one is not enough: the purge, the eviction and the recording of a vote must reach it as
 * well, the way the composition root wires them. This builds them again over the caches given.
 */
export function withCaches<
  Fakes extends Pick<
    ReturnType<typeof createFakes>,
    'auth' | 'clock' | 'appLock' | 'monitoring' | 'meetingCache' | 'documentCache'
  >,
>(fakes: Fakes, caches: CacheOverrides) {
  const meetingCache = caches.meetingCache ?? fakes.meetingCache;
  const documentCache = caches.documentCache ?? fakes.documentCache;
  const purgers = sessionDataPurgers({ meetingCache, documentCache });
  const session = { ...fakes, sessionDataPurgers: purgers };
  return {
    ...fakes,
    meetingCache,
    documentCache,
    sessionDataPurgers: purgers,
    sessionGate: new AuthSessionGate(session),
    documentEvictor: new DocumentCacheEvictor(documentCache),
    recordedVoteSink: new MeetingCacheVoteRecorder(meetingCache, session),
  };
}
