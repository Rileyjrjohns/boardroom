import { FakeClock } from '@core/application/testing/FakeClock';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import type { AppError } from '@core/domain/errors/AppError';
import {
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from '@core/domain/errors/RepositoryError';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { UserId } from '@core/domain/value-objects/ids';
import { aDuration, aUserId } from '@testing/domain/builders';

import type { SessionGate } from '../ports/SessionGate';
import type { SessionRefusal } from '../ports/types/SessionRefusal';

import { CACHE_RESOURCE } from './CacheResource';
import { loadWithCacheFallback } from './loadWithCacheFallback';
import type { CacheFallbackSource } from './loadWithCacheFallback';

// The offline policy asks the session through a port of the core, and knows nothing of what a
// session is. These tests give it a gate of their own, with refusals of their own, to say what the
// policy does with each answer; the policy with the session of `auth` behind the gate is tested in
// loadWithCacheFallback.test.ts.

interface TestRefusal extends AppError {
  readonly code: 'someoneElse';
}
const SOMEONE_ELSE: TestRefusal = { code: 'someoneElse' };

const OWNER = aUserId();

/** A gate that answers as scripted and records what it was asked. */
function aGate(answer: Result<UserId, SessionRefusal<TestRefusal>> = ok(OWNER)) {
  const calls = { required: [] as UserId[], ended: [] as UserId[], purged: 0 };
  const gate: SessionGate<TestRefusal> = {
    requireSameUser: (expected) => {
      calls.required.push(expected);
      return Promise.resolve(answer);
    },
    endRefusedSession: (user) => {
      calls.ended.push(user);
      return Promise.resolve();
    },
    purgeSessionData: () => {
      calls.purged += 1;
      return Promise.resolve();
    },
  };
  return { gate, calls };
}

function aSource(fetched: Result<string, RepositoryError>, drop: { removeFails?: boolean } = {}) {
  const log = { saved: 0, removed: 0, revoked: 0 };
  const source: CacheFallbackSource<string, RepositoryError> = {
    resource: CACHE_RESOURCE.Meeting,
    attributes: {},
    fetch: () => Promise.resolve(fetched),
    save: () => {
      log.saved += 1;
      return Promise.resolve(ok(undefined));
    },
    read: () => Promise.resolve(ok(undefined)),
    remove: () => {
      log.removed += 1;
      return Promise.resolve(drop.removeFails === true ? err(storageWriteFailed()) : ok(undefined));
    },
    revoke: () => {
      log.revoked += 1;
      return Promise.resolve(drop.removeFails === true ? err(storageWriteFailed()) : ok(undefined));
    },
  };
  return { source, log };
}

function deps(gate: SessionGate<TestRefusal>) {
  return {
    clock: new FakeClock(),
    monitoring: new FakeMonitoring(),
    sessionGate: gate,
    maxCacheAge: aDuration(3_600_000),
  };
}

describe('loadWithCacheFallback, over a session gate of the core', () => {
  it('asks the gate whether the user who asked is still the one signed in, once the remote source has answered', async () => {
    const { gate, calls } = aGate();
    const { source, log } = aSource(ok('remote'));

    const result = await loadWithCacheFallback(deps(gate), OWNER, source);

    expect(calls.required).toEqual([OWNER]);
    expect(result.ok && result.value.data).toBe('remote');
    expect(log.saved).toBe(1);
  });

  it('returns the error of the refusal as it is, with its own type, and saves nothing', async () => {
    const { gate } = aGate(err({ error: SOMEONE_ELSE, sessionKept: false }));
    const { source, log } = aSource(ok('remote'));

    const result = await loadWithCacheFallback(deps(gate), OWNER, source);

    expect(result).toEqual(err(SOMEONE_ELSE));
    expect(log.saved).toBe(0);
  });

  it('empties what the session left when the data was fetched and the user is gone: nothing points at what the source kept', async () => {
    const { gate, calls } = aGate(err({ error: SOMEONE_ELSE, sessionKept: false }));

    await loadWithCacheFallback(deps(gate), OWNER, aSource(ok('remote')).source);

    expect(calls.purged).toBe(1);
  });

  it('leaves what the session left alone when the session is kept, and waits for the user to come back', async () => {
    const { gate, calls } = aGate(err({ error: SOMEONE_ELSE, sessionKept: true }));

    await loadWithCacheFallback(deps(gate), OWNER, aSource(ok('remote')).source);

    expect(calls.purged).toBe(0);
  });

  it('empties nothing when the remote call failed: it kept nothing', async () => {
    const { gate, calls } = aGate(err({ error: SOMEONE_ELSE, sessionKept: false }));

    const result = await loadWithCacheFallback(
      deps(gate),
      OWNER,
      aSource(err(networkUnavailable())).source,
    );

    expect(result).toEqual(err(SOMEONE_ELSE));
    expect(calls.purged).toBe(0);
  });

  it('has the gate end the session when the server refuses it, and returns the refusal', async () => {
    const { gate, calls } = aGate();

    const result = await loadWithCacheFallback(
      deps(gate),
      OWNER,
      aSource(err(unauthorized())).source,
    );

    expect(result).toEqual(err(unauthorized()));
    expect(calls.ended).toEqual([OWNER]);
    expect(calls.purged).toBe(0);
  });

  it('drops the entry when the server refuses the item, and has the gate empty everything if that fails', async () => {
    const { gate, calls } = aGate();
    const { source, log } = aSource(err(notFound()), { removeFails: true });

    const result = await loadWithCacheFallback(deps(gate), OWNER, source);

    expect(result).toEqual(err(notFound()));
    expect(log.revoked).toBe(1);
    expect(calls.purged).toBe(1);
  });

  it('does not touch the session for a fault of the server', async () => {
    const { gate, calls } = aGate();

    await loadWithCacheFallback(deps(gate), OWNER, aSource(err(unexpected())).source);

    expect(calls.ended).toEqual([]);
    expect(calls.purged).toBe(0);
  });
});
