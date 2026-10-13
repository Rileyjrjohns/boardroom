import { ok } from '@domain/shared/Result';

import { SCREEN_CAPTURE_KIND } from '../../ports/ScreenProtection';
import type { ScreenCaptureEvent, ScreenProtection } from '../../ports/ScreenProtection';

export interface ScreenProtectionHarness {
  readonly protection: ScreenProtection;
  /** Whether the protection is on, as far as the adapter can tell. */
  isEnabled(): boolean;
  /** Simulates the system reporting a capture. */
  emit(event: ScreenCaptureEvent): void;
}

export type ScreenProtectionFactory = () =>
  ScreenProtectionHarness | Promise<ScreenProtectionHarness>;

const SCREENSHOT: ScreenCaptureEvent = { kind: SCREEN_CAPTURE_KIND.ScreenshotTaken };
const RECORDING: ScreenCaptureEvent = { kind: SCREEN_CAPTURE_KIND.RecordingStarted };

/**
 * The contract of `ScreenProtection`, as a suite any implementation runs: one global switch,
 * idempotent in both directions, and capture events delivered to every subscriber until it
 * unsubscribes, which can be done twice. The factory returns a protection that is off and has no
 * subscriber, on a platform that supports it.
 */
export function describeScreenProtectionContract(
  name: string,
  createHarness: ScreenProtectionFactory,
): void {
  describe(`${name} honours the ScreenProtection contract`, () => {
    let harness: ScreenProtectionHarness;
    let protection: ScreenProtection;

    beforeEach(async () => {
      harness = await createHarness();
      protection = harness.protection;
    });

    it('turns on and off', async () => {
      expect(harness.isEnabled()).toBe(false);

      expect(await protection.enable()).toStrictEqual(ok(undefined));
      expect(harness.isEnabled()).toBe(true);

      expect(await protection.disable()).toStrictEqual(ok(undefined));
      expect(harness.isEnabled()).toBe(false);
    });

    it('is idempotent: enabling twice leaves it on, and disabling twice, or when it is off, succeeds', async () => {
      expect(await protection.disable()).toStrictEqual(ok(undefined));

      await protection.enable();
      expect(await protection.enable()).toStrictEqual(ok(undefined));
      expect(harness.isEnabled()).toBe(true);

      await protection.disable();
      expect(await protection.disable()).toStrictEqual(ok(undefined));
      expect(harness.isEnabled()).toBe(false);
    });

    it('is one global switch: a single disable turns it off however often it was enabled', async () => {
      await protection.enable();
      await protection.enable();

      await protection.disable();

      expect(harness.isEnabled()).toBe(false);
    });

    it('delivers capture events to a subscriber, in order, until it unsubscribes', () => {
      const received: ScreenCaptureEvent[] = [];
      const unsubscribe = protection.subscribe((event) => received.push(event));

      harness.emit(SCREENSHOT);
      harness.emit(RECORDING);
      unsubscribe();
      harness.emit(SCREENSHOT);

      expect(received).toEqual([SCREENSHOT, RECORDING]);
    });

    it('delivers an event to every subscriber, and stops each one on its own', () => {
      const first: ScreenCaptureEvent[] = [];
      const second: ScreenCaptureEvent[] = [];
      const stopFirst = protection.subscribe((event) => first.push(event));
      protection.subscribe((event) => second.push(event));

      harness.emit(SCREENSHOT);
      stopFirst();
      harness.emit(RECORDING);

      expect(first).toEqual([SCREENSHOT]);
      expect(second).toEqual([SCREENSHOT, RECORDING]);
    });

    it('lets a subscriber unsubscribe twice without harm to the others', () => {
      const kept: ScreenCaptureEvent[] = [];
      const stop = protection.subscribe(() => undefined);
      protection.subscribe((event) => kept.push(event));

      stop();
      stop();
      harness.emit(SCREENSHOT);

      expect(kept).toEqual([SCREENSHOT]);
    });

    it('reports a capture to nobody when nobody subscribed', () => {
      expect(() => harness.emit(SCREENSHOT)).not.toThrow();
    });
  });
}
