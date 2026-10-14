import { FakeClock } from '@application/testing/FakeClock';
import {
  aDuration,
  aMeetingWithAgenda,
  aUser,
  aUserId,
  anEmail,
  MILLIS_PER_HOUR,
} from '@domain/testing/builders';

import type { Credentials } from '@domain/value-objects/Credentials';

import type { Sleep } from '../clock/sleep';
import { valid } from '../shared/valid';
import { InMemoryAuthSession } from '../in-memory/InMemoryAuthSession';
import type { DemoAccount } from '../in-memory/InMemoryAuthSession';
import { InMemoryBackend } from '../in-memory/InMemoryBackend';
import type { ServerContent } from '../in-memory/InMemoryBackend';
import { InMemoryDocumentContent } from '../in-memory/InMemoryDocumentContent';
import { InMemoryDocumentRepository } from '../in-memory/InMemoryDocumentRepository';
import { InMemoryMeetingRepository } from '../in-memory/InMemoryMeetingRepository';
import { InMemoryVoteRepository } from '../in-memory/InMemoryVoteRepository';
import { SimulatedNetwork } from '../in-memory/SimulatedNetwork';

import { immediateSleep } from './sleep';

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
  const files = new InMemoryDocumentContent();

  return {
    clock,
    network,
    accounts,
    auth,
    backend,
    files,
    /** Replaces what the server holds. A content the server refuses is a broken fixture. */
    load: (content: ServerContent) => valid(backend.replaceContent(content)),
    meetings: new InMemoryMeetingRepository(backend),
    documents: new InMemoryDocumentRepository(backend, files),
    votes: new InMemoryVoteRepository(backend),
  };
}
