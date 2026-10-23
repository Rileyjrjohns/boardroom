import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { SCREEN_PROTECTION_ERROR_CODE } from '@core/domain/errors/ScreenProtectionError';
import { SCREEN_CAPTURE_KIND } from '@features/documents/application/ports/ScreenProtection';
import type { ScreenCaptureEvent } from '@features/documents/application/ports/ScreenProtection';
import { describeScreenProtectionContract } from '@features/documents/application/testing/contracts/screenProtectionContract';

import { FakeScreenProtectionModule } from '../testing/FakeScreenProtectionModule';

import { NativeScreenProtection } from './NativeScreenProtection';

const { ScreenshotTaken, RecordingStarted, RecordingStopped } = SCREEN_CAPTURE_KIND;

/** Lets what the adapter does in the background (reading the starting point) finish. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function anAdapter(overrides: { timeoutMillis?: number } = {}) {
  const module = new FakeScreenProtectionModule();
  const monitoring = new FakeMonitoring();
  const protection = new NativeScreenProtection({ module, monitoring, ...overrides });
  const received: ScreenCaptureEvent[] = [];
  const listen = () => protection.subscribe((event) => received.push(event));
  return { module, monitoring, protection, received, listen };
}

// The contract of the port, against the adapter over a stand-in of the native module. The stand-in
// turns the protection on later than it turns it off, so the order of the calls is really tested.
describeScreenProtectionContract('NativeScreenProtection', () => {
  const module = new FakeScreenProtectionModule();
  return {
    protection: new NativeScreenProtection({ module, monitoring: new FakeMonitoring() }),
    isEnabled: () => module.enabled,
    emit: (event) => {
      if (event.kind === ScreenshotTaken) module.emitScreenshot();
      else module.emitCapture({ captured: event.kind === RecordingStarted });
    },
  };
});

describe('NativeScreenProtection, turning the protection on and off', () => {
  it('asks the module for each call, with the state wanted', async () => {
    const { module, protection } = anAdapter();

    await protection.enable();
    await protection.enable();
    await protection.disable();

    expect(module.calls).toEqual([true, true, false]);
  });

  it('gives the calls to the module one at a time, in the order they were issued', async () => {
    const { module, protection } = anAdapter();

    await Promise.all([protection.enable(), protection.disable(), protection.enable()]);

    expect(module.calls).toEqual([true, false, true]);
    expect(module.enabled).toBe(true);
  });

  describe('when the module fails', () => {
    it.each([
      ['rejects', (module: FakeScreenProtectionModule) => module.rejectWith(new Error('boom'))],
      ['throws', (module: FakeScreenProtectionModule) => module.throwSynchronously()],
    ])('answers an error, never throws, when it %s, and works again after', async (_name, fail) => {
      const { module, monitoring, protection } = anAdapter();
      fail(module);

      const enabled = await protection.enable();
      const disabled = await protection.disable();

      expect(enabled).toEqual({
        ok: false,
        error: { code: SCREEN_PROTECTION_ERROR_CODE.Failed },
      });
      expect(disabled).toEqual({
        ok: false,
        error: { code: SCREEN_PROTECTION_ERROR_CODE.Failed },
      });
      expect(monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.ScreenProtectionNativeFailed,
        MONITORING_EVENT.ScreenProtectionNativeFailed,
      ]);

      module.rejectWith(undefined);
      module.throwSynchronously(false);
      expect((await protection.enable()).ok).toBe(true);
      expect(module.enabled).toBe(true);
    });

    it('reports a kind of failure and nothing the failure said', async () => {
      const { module, monitoring, protection } = anAdapter();
      module.rejectWith(
        Object.assign(new Error('/private/var/mobile/secret.pdf'), { code: 'ERR_ACTIVITY' }),
      );

      await protection.enable();

      expect(monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.ScreenProtectionNativeFailed,
          error: { code: SCREEN_PROTECTION_ERROR_CODE.Failed },
          attributes: { [LOG_ATTRIBUTE.Reason]: 'ERR_ACTIVITY' },
        },
      ]);
    });

    it('settles when the module never answers, and the calls after it still go through', async () => {
      const { module, protection } = anAdapter({ timeoutMillis: 20 });
      module.hang();

      const stuck = await protection.enable();
      module.hang(false);
      const next = await protection.disable();

      expect(stuck).toEqual({ ok: false, error: { code: SCREEN_PROTECTION_ERROR_CODE.Failed } });
      expect(next.ok).toBe(true);
      expect(module.calls).toEqual([true, false]);
    });
  });

  describe('when the build has no native module', () => {
    const noModule = () =>
      new NativeScreenProtection({ module: undefined, monitoring: new FakeMonitoring() });

    it('cannot protect the screen: enabling is refused, so a document is not shown unprotected', async () => {
      expect(await noModule().enable()).toEqual({
        ok: false,
        error: { code: SCREEN_PROTECTION_ERROR_CODE.Unsupported },
      });
    });

    it('has nothing to turn off: disabling succeeds', async () => {
      expect((await noModule().disable()).ok).toBe(true);
    });

    it('delivers no event, and unsubscribing works', () => {
      const unsubscribe = noModule().subscribe(() => undefined);

      expect(() => {
        unsubscribe();
        unsubscribe();
      }).not.toThrow();
    });
  });
});

describe('NativeScreenProtection, the events', () => {
  it('listens to the module only while someone is subscribed, once for everybody', () => {
    const { module, listen } = anAdapter();
    expect(module.listenerCount('onScreenshotTaken')).toBe(0);
    expect(module.listenerCount('onCaptureChanged')).toBe(0);

    const first = listen();
    const second = listen();
    expect(module.listenerCount('onScreenshotTaken')).toBe(1);
    expect(module.listenerCount('onCaptureChanged')).toBe(1);

    first();
    expect(module.listenerCount('onScreenshotTaken')).toBe(1);
    second();
    expect(module.listenerCount('onScreenshotTaken')).toBe(0);
    expect(module.listenerCount('onCaptureChanged')).toBe(0);
  });

  it('listens again when someone subscribes after everybody left', () => {
    const { module, listen, received } = anAdapter();
    listen()();

    listen();
    module.emitScreenshot();

    expect(module.listenerCount('onScreenshotTaken')).toBe(1);
    expect(received).toEqual([{ kind: ScreenshotTaken }]);
  });

  it('maps a screenshot, and a recording that starts and stops', async () => {
    const { module, listen, received } = anAdapter();
    listen();
    await settle();

    module.emitScreenshot();
    module.emitCapture({ captured: true });
    module.emitCapture({ captured: false });

    expect(received).toEqual([
      { kind: ScreenshotTaken },
      { kind: RecordingStarted },
      { kind: RecordingStopped },
    ]);
  });

  it('tells a change once: a report of the state that is already known is dropped', async () => {
    const { module, listen, received } = anAdapter();
    listen();
    await settle();

    module.emitCapture({ captured: true });
    module.emitCapture({ captured: true });
    module.emitCapture({ captured: false });
    module.emitCapture({ captured: false });

    expect(received).toEqual([{ kind: RecordingStarted }, { kind: RecordingStopped }]);
  });

  it('ignores a report that is not a state', async () => {
    const { module, listen, received } = anAdapter();
    listen();
    await settle();

    for (const payload of [undefined, null, {}, { captured: 'yes' }, 'true', 1]) {
      module.emitRawCapture(payload);
    }

    expect(received).toEqual([]);
  });

  it('tells nobody after the last subscriber left, even if the module still reports', () => {
    const { module, listen, received } = anAdapter();
    const stop = listen();
    stop();

    module.emitScreenshot();
    module.emitCapture({ captured: true });

    expect(received).toEqual([]);
  });

  describe('a recording that is already running', () => {
    it('is told to the first subscriber, as a start', async () => {
      const { module, listen, received } = anAdapter();
      module.captured = true;

      listen();
      await settle();

      expect(received).toEqual([{ kind: RecordingStarted }]);
    });

    it('is told to a subscriber who comes later, and only to them', async () => {
      const { module, protection, listen, received } = anAdapter();
      module.captured = true;
      listen();
      await settle();
      const later: ScreenCaptureEvent[] = [];

      protection.subscribe((event) => later.push(event));
      await settle();

      expect(later).toEqual([{ kind: RecordingStarted }]);
      expect(received).toEqual([{ kind: RecordingStarted }]);
    });

    it('is not told to a subscriber who has already left', async () => {
      const { module, protection, listen } = anAdapter();
      module.captured = true;
      listen();
      await settle();
      const later: ScreenCaptureEvent[] = [];

      protection.subscribe((event) => later.push(event))();
      await settle();

      expect(later).toEqual([]);
    });

    it('is not told when the screen is not being recorded', async () => {
      const { listen, received } = anAdapter();

      listen();
      await settle();

      expect(received).toEqual([]);
    });

    it('gives way to a change that came first: the answer of the module is then out of date', async () => {
      const { module, listen, received } = anAdapter();
      module.captured = true;
      const release = module.holdNextCaptureQuery();
      listen();

      module.emitCapture({ captured: false });
      release();
      await settle();

      expect(received).toEqual([{ kind: RecordingStopped }]);
    });

    it('is not told by an answer that comes after everybody left', async () => {
      const { module, listen, received } = anAdapter();
      module.captured = true;
      const release = module.holdNextCaptureQuery();
      listen()();

      release();
      await settle();

      expect(received).toEqual([]);
    });

    it('is not told by an answer to an earlier listening, once someone listens again', async () => {
      const { module, listen, received } = anAdapter();
      module.captured = true;
      const release = module.holdNextCaptureQuery();
      listen()();
      module.captured = false;
      listen();

      release();
      await settle();

      expect(received).toEqual([]);
    });

    it('is simply not known when the module cannot say, and the changes still come', async () => {
      const { module, listen, received } = anAdapter();
      module.rejectCaptureQueryWith(new Error('x'));

      listen();
      await settle();
      module.emitCapture({ captured: true });

      expect(received).toEqual([{ kind: RecordingStarted }]);
    });
  });

  describe('when something goes wrong', () => {
    it('does not throw when the module cannot be listened to, and says so', () => {
      const { module, monitoring, listen, received } = anAdapter();
      module.failToListenWith(new Error('no emitter'));

      expect(() => listen()).not.toThrow();

      expect(received).toEqual([]);
      expect(monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.ScreenProtectionNativeFailed,
        MONITORING_EVENT.ScreenProtectionNativeFailed,
      ]);
    });

    it('does not let a listener that throws stop the others, nor escape, and says so', () => {
      const { module, monitoring, protection } = anAdapter();
      const heard: ScreenCaptureEvent[] = [];
      protection.subscribe(() => {
        throw new Error('listener');
      });
      protection.subscribe((event) => heard.push(event));

      expect(() => module.emitScreenshot()).not.toThrow();

      expect(heard).toEqual([{ kind: ScreenshotTaken }]);
      expect(monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.ScreenProtectionListenerFailed,
      ]);
    });

    it('does not let a late listener that throws escape', async () => {
      const { module, monitoring, protection, listen } = anAdapter();
      module.captured = true;
      listen();
      await settle();

      protection.subscribe(() => {
        throw new Error('listener');
      });
      await settle();

      expect(monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.ScreenProtectionListenerFailed,
      ]);
    });

    it('does not throw when a native listener cannot be removed, and says so', () => {
      const { module, monitoring, listen } = anAdapter();
      const stop = listen();
      module.failToRemoveWith(new Error('gone'));

      expect(() => stop()).not.toThrow();

      expect(monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.ScreenProtectionNativeFailed,
        MONITORING_EVENT.ScreenProtectionNativeFailed,
      ]);
    });
  });
});
