import {
  screenProtectionFailed,
  screenProtectionUnsupported,
} from '@core/domain/errors/ScreenProtectionError';
import { err, ok } from '@core/domain/shared/Result';
import { aDocumentId } from '@testing/domain/builders';

import type { ScreenProtection } from './ports/ScreenProtection';
import { FakeScreenProtection } from './testing/FakeScreenProtection';

import { ScreenProtectionCoordinator } from './ScreenProtectionCoordinator';

/** Lets the promises that are ready run. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const A = aDocumentId('document-A');
const B = aDocumentId('document-B');

function setup() {
  const screenProtection = new FakeScreenProtection();
  return { screenProtection, coordinator: new ScreenProtectionCoordinator({ screenProtection }) };
}

describe('ScreenProtectionCoordinator', () => {
  it('turns the protection on when a confidential document is opened', async () => {
    const { screenProtection, coordinator } = setup();

    expect(await coordinator.acquire(A)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(true);
  });

  it('turns the protection off when the only open document is closed', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);

    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(false);
  });

  it('keeps the protection on while another confidential document is still open', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(B);

    await coordinator.release(B);

    expect(screenProtection.enabled).toBe(true);
    expect(screenProtection.disableCalls).toBe(0);

    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(false);
    expect(screenProtection.disableCalls).toBe(1);
  });

  it('does not depend on the order in which the documents are closed', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(B);

    await coordinator.release(A);
    expect(screenProtection.enabled).toBe(true);
    await coordinator.release(B);

    expect(screenProtection.enabled).toBe(false);
  });

  it('ignores the closing of an unknown document: nothing is switched, it succeeds', async () => {
    const { screenProtection, coordinator } = setup();

    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.disableCalls).toBe(0);

    await coordinator.acquire(B);
    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(true);
  });

  it('ignores the closing of a document that is already closed', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(B);
    await coordinator.release(A);

    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(true);
    expect(screenProtection.disableCalls).toBe(0);
  });

  it('counts the views of a document: closing one of two leaves the other protected', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(A);

    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(true);
    expect(screenProtection.disableCalls).toBe(0);

    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(false);
    expect(screenProtection.disableCalls).toBe(1);
  });

  it('counts the views of every document together: the last view of all turns the protection off', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(A);
    await coordinator.acquire(B);

    await coordinator.release(A);
    await coordinator.release(B);
    expect(screenProtection.enabled).toBe(true);

    await coordinator.release(A);
    expect(screenProtection.enabled).toBe(false);
  });

  it('does not count a view twice for one close: a document with no view left is ignored', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(B);

    await coordinator.release(A);
    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(true);
  });

  it('does not register a document whose protection could not be turned on', async () => {
    const { screenProtection, coordinator } = setup();
    screenProtection.enableFailure = screenProtectionUnsupported();

    expect(await coordinator.acquire(A)).toEqual(err(screenProtectionUnsupported()));

    screenProtection.enableFailure = undefined;
    await coordinator.acquire(B);
    await coordinator.release(B);
    expect(screenProtection.enabled).toBe(false);
    // A was never registered: closing it again does not touch the protection.
    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.disableCalls).toBe(1);
  });

  it('does not keep counting a view whose protection could not be turned off', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    screenProtection.disableFailure = screenProtectionFailed();

    expect(await coordinator.release(A)).toEqual(err(screenProtectionFailed()));
    expect(screenProtection.enabled).toBe(true);

    // The view is gone whatever the platform said: the next document that is opened and closed
    // finds no view of A left, and turns the protection off for good.
    screenProtection.disableFailure = undefined;
    await coordinator.acquire(B);
    expect(await coordinator.release(B)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(false);
  });

  it('retries the disable that failed on the next release that leaves no view', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    screenProtection.disableFailure = screenProtectionFailed();
    await coordinator.release(A);
    screenProtection.disableFailure = undefined;

    // The same document closed again: it has no view, and there is none at all.
    expect(await coordinator.release(A)).toEqual(ok(undefined));

    expect(screenProtection.enabled).toBe(false);
    expect(screenProtection.disableCalls).toBe(2);
    // Once it went through, nothing is pending any more.
    await coordinator.release(A);
    expect(screenProtection.disableCalls).toBe(2);
  });

  it('keeps the protection on, and does not retry the disable, while a view is open', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    screenProtection.disableFailure = screenProtectionFailed();
    await coordinator.release(A);
    screenProtection.disableFailure = undefined;

    await coordinator.acquire(B);
    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(true);
    expect(screenProtection.disableCalls).toBe(1);

    await coordinator.release(B);

    expect(screenProtection.enabled).toBe(false);
  });

  it('ends with the protection off after A fails to close, then B is opened and closed', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    screenProtection.disableFailure = screenProtectionFailed();
    await coordinator.release(A);
    screenProtection.disableFailure = undefined;

    await coordinator.acquire(B);
    await coordinator.release(B);

    expect(screenProtection.enabled).toBe(false);
  });

  it('keeps no memory of its own between two instances', async () => {
    const screenProtection = new FakeScreenProtection();
    const first = new ScreenProtectionCoordinator({ screenProtection });
    const second = new ScreenProtectionCoordinator({ screenProtection });
    await first.acquire(A);

    await second.release(A);

    expect(screenProtection.enabled).toBe(true);
  });

  describe('the calls to the platform', () => {
    /** A platform whose answers the test gives by hand, one call at a time. */
    function manualPlatform() {
      const calls: string[] = [];
      const pending: (() => void)[] = [];
      const screenProtection: ScreenProtection = {
        enable: () => {
          calls.push('enable');
          return new Promise((resolve) => pending.push(() => resolve(ok(undefined))));
        },
        disable: () => {
          calls.push('disable');
          return new Promise((resolve) => pending.push(() => resolve(ok(undefined))));
        },
        subscribe: () => () => undefined,
      };
      // Lets the queue reach the platform, then answers the oldest call it is waiting for.
      const settleNext = async () => {
        await settle();
        pending.shift()?.();
        await settle();
      };
      return {
        calls,
        settleNext,
        coordinator: new ScreenProtectionCoordinator({ screenProtection }),
      };
    }

    it('are issued in the order they were asked for, each one after the previous has settled', async () => {
      const { calls, settleNext, coordinator } = manualPlatform();

      const opening = coordinator.acquire(A);
      await settleNext();
      await opening;
      // A is closed while B is being opened: the slow disable of A must not land after the enable of B.
      const closing = coordinator.release(A);
      const nextOpening = coordinator.acquire(B);
      await settle();

      expect(calls).toEqual(['enable', 'disable']);

      await settleNext();
      await closing;
      expect(calls).toEqual(['enable', 'disable', 'enable']);

      await settleNext();
      await nextOpening;
    });

    it('end with the protection on when the last call asked for it, whatever the speed of the platform', async () => {
      const screenProtection = new FakeScreenProtection();
      const coordinator = new ScreenProtectionCoordinator({ screenProtection });
      await coordinator.acquire(A);

      await Promise.all([coordinator.release(A), coordinator.acquire(B), coordinator.acquire(A)]);

      expect(screenProtection.enabled).toBe(true);
      expect(await coordinator.release(B)).toEqual(ok(undefined));
      expect(screenProtection.enabled).toBe(true);
    });

    it('go on after a call that failed: one failure does not block the queue', async () => {
      const answers = [err(screenProtectionFailed()), ok(undefined)];
      const calls: string[] = [];
      const screenProtection: ScreenProtection = {
        enable: () => {
          calls.push('enable');
          return Promise.resolve(answers.shift() ?? ok(undefined));
        },
        disable: () => Promise.resolve(ok(undefined)),
        subscribe: () => () => undefined,
      };
      const coordinator = new ScreenProtectionCoordinator({ screenProtection });

      const [failing, succeeding] = await Promise.all([
        coordinator.acquire(A),
        coordinator.acquire(B),
      ]);

      expect(failing).toEqual(err(screenProtectionFailed()));
      expect(succeeding).toEqual(ok(undefined));
      expect(calls).toEqual(['enable', 'enable']);
    });
  });
});
