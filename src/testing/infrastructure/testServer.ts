import { InMemoryAuthSession } from '@composition/dev/in-memory/InMemoryAuthSession';
import type { DemoAccount } from '@composition/dev/in-memory/InMemoryAuthSession';
import { InMemoryBackend } from '@composition/dev/in-memory/InMemoryBackend';
import type { ServerContent } from '@composition/dev/in-memory/InMemoryBackend';
import { InMemoryDocumentRepository } from '@composition/dev/in-memory/InMemoryDocumentRepository';
import { InMemoryMeetingRepository } from '@composition/dev/in-memory/InMemoryMeetingRepository';
import { InMemoryVoteRepository } from '@composition/dev/in-memory/InMemoryVoteRepository';
import { SimulatedNetwork } from '@composition/dev/in-memory/SimulatedNetwork';
import { FakeClock } from '@core/application/testing/FakeClock';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import type { Sleep } from '@core/infrastructure/clock/sleep';
import type { FileStore } from '@core/infrastructure/files/FileStore';
import { valid } from '@core/infrastructure/shared/valid';
import { immediateSleep } from '@core/infrastructure/testing/sleep';
import { testFileStore } from '@core/infrastructure/testing/testFiles';
import type { Credentials } from '@features/auth/domain/value-objects/Credentials';
import {
  aDuration,
  aMeetingWithAgenda,
  aUser,
  aUserId,
  anEmail,
  MILLIS_PER_HOUR,
} from '@testing/domain/builders';

// Test support, not production code: the simulated server of the tests, wired by hand the way the
// composition root wires the real one, with a clock that only moves when the test says so and a
// network that does not wait. Only tests and other test support import it.

/** The password of the accounts of the test server. */
export const TEST_PASSWORD = 'test-password';

export interface TestServerOptions {
  /** What the server holds. By default, the meeting of `aMeetingWithAgenda()` and nothing recorded. */
  readonly content?: ServerContent;
  /** How the latency is waited for. By default, not at all. */
  readonly sleep?: Sleep;
  /** Whether `user-1` is signed in at first. By default, yes. */
  readonly signedIn?: boolean;
  /** Where the downloads of the documents are kept. By default, a directory of the temporary folder. */
  readonly files?: FileStore;
}

/** What the user of an account types to sign in. */
export function credentialsOf(account: DemoAccount): Credentials {
  return { email: account.user.email, password: account.password };
}

/** The two accounts of the test server: `user-1` (Alice) and `user-2` (Bruno). */
function testAccounts(): readonly [DemoAccount, DemoAccount] {
  return [
    { user: aUser(), password: TEST_PASSWORD },
    {
      user: aUser({
        id: aUserId('user-2'),
        fullName: 'Bruno Durand',
        email: anEmail('bruno@example.com'),
      }),
      password: TEST_PASSWORD,
    },
  ];
}

export function createTestServer(options: TestServerOptions = {}) {
  const clock = new FakeClock();
  const network = new SimulatedNetwork({
    sleep: options.sleep ?? immediateSleep,
    latency: aDuration(0),
  });
  const accounts = testAccounts();
  const auth = new InMemoryAuthSession({
    clock,
    network,
    accounts,
    sessionLifetime: aDuration(MILLIS_PER_HOUR),
  });
  if (options.signedIn ?? true) auth.openSessionFor(accounts[0].user);

  const backend = valid(
    InMemoryBackend.create({
      clock,
      auth,
      network,
      content: options.content ?? { meetings: [aMeetingWithAgenda()], recordedVotes: [] },
    }),
  );
  const files = options.files ?? testFileStore();
  const monitoring = new FakeMonitoring();

  return {
    clock,
    network,
    accounts,
    auth,
    backend,
    files,
    monitoring,
    /** Replaces what the server holds. A content the server refuses is a broken fixture. */
    load: (content: ServerContent) => valid(backend.replaceContent(content)),
    meetings: new InMemoryMeetingRepository(backend),
    documents: new InMemoryDocumentRepository(backend, files, monitoring),
    votes: new InMemoryVoteRepository(backend),
  };
}
