import { aDuration, MILLIS_PER_DAY } from '@domain/testing/builders';

import { AppLock } from '../shared/AppLock';
import { ScreenProtectionCoordinator } from '../shared/ScreenProtectionCoordinator';

import { FakeAuthSession } from './FakeAuthSession';
import { FakeBiometricGate } from './FakeBiometricGate';
import { FakeClock } from './FakeClock';
import { FakeDocumentCache } from './FakeDocumentCache';
import { FakeDocumentRepository } from './FakeDocumentRepository';
import { FakeMeetingCache } from './FakeMeetingCache';
import { FakeMeetingRepository } from './FakeMeetingRepository';
import { FakeMonitoring } from './FakeMonitoring';
import { FakeNetwork } from './FakeNetwork';
import { FakeScreenProtection } from './FakeScreenProtection';
import { FakeVoteOutbox } from './FakeVoteOutbox';
import { FakeVoteRepository } from './FakeVoteRepository';

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
