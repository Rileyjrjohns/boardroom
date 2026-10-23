import { FakeClock } from '@core/application/testing/FakeClock';
import { FakeConnectivity } from '@core/application/testing/FakeConnectivity';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { FakeNetwork } from '@core/application/testing/FakeNetwork';
import { AppLock } from '@features/auth/application/session/AppLock';
import { FakeAuthSession } from '@features/auth/application/testing/FakeAuthSession';
import { FakeBiometricGate } from '@features/auth/application/testing/FakeBiometricGate';
import { ScreenProtectionCoordinator } from '@features/documents/application/ScreenProtectionCoordinator';
import { FakeDocumentCache } from '@features/documents/application/testing/FakeDocumentCache';
import { FakeDocumentRepository } from '@features/documents/application/testing/FakeDocumentRepository';
import { FakeScreenProtection } from '@features/documents/application/testing/FakeScreenProtection';
import { FakeMeetingCache } from '@features/meetings/application/testing/FakeMeetingCache';
import { FakeMeetingRepository } from '@features/meetings/application/testing/FakeMeetingRepository';
import { FakeVoteOutbox } from '@features/votes/application/testing/FakeVoteOutbox';
import { FakeVoteRepository } from '@features/votes/application/testing/FakeVoteRepository';
import { aDuration, MILLIS_PER_DAY } from '@testing/domain/builders';

/**
 * One fake of every port, wired together: the remote fakes share `network`. The property names are
 * those of the `deps` objects of the use cases, so the whole set can be passed to any of them:
 * `new CastVote(createFakes())`. The user is signed in, the network is up, the clock stands at
 * `NOW`, the app is unlocked, the biometrics succeed and the screen protection is available. It also carries the values
 * of the configuration the use cases take in their deps: `maxCacheAge` (7 days) and `maxAttempts`
 * (5).
 */
export function createFakes() {
  const network = new FakeNetwork();
  const auth = new FakeAuthSession();
  const screenProtection = new FakeScreenProtection();
  return {
    network,
    clock: new FakeClock(),
    appLock: new AppLock({ locked: false }),
    monitoring: new FakeMonitoring(),
    auth,
    biometricGate: new FakeBiometricGate(),
    connectivity: new FakeConnectivity(),
    screenProtection,
    screenProtectionCoordinator: new ScreenProtectionCoordinator({ screenProtection }),
    maxCacheAge: aDuration(7 * MILLIS_PER_DAY),
    maxAttempts: 5,
    meetings: new FakeMeetingRepository(network),
    meetingCache: new FakeMeetingCache(),
    documents: new FakeDocumentRepository(network),
    documentCache: new FakeDocumentCache(),
    votes: new FakeVoteRepository(network, auth),
    outbox: new FakeVoteOutbox(),
  };
}
