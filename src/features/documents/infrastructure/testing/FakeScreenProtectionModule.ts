import type {
  CaptureChangedPayload,
  NativeSubscription,
  ScreenProtectionEvents,
  ScreenProtectionModuleApi,
} from '../native/ScreenProtectionModuleApi';

// Test support, not production code. A stand-in for the native module ScreenProtection, written in
// JavaScript, because the real one is Swift and Kotlin and needs a device: it is acceptable here,
// for the adapter, and nowhere else.
//
// It behaves like the module in the ways the adapter depends on: `setProtectionEnabled` changes the
// state when its work is done and not before, and a call that is slower (turning on takes longer
// than turning off) finishes later, so an adapter that did not keep the order of its calls would
// show it; an event is delivered to the listeners added for that event, and only to them; and it can
// be made to reject, to throw, to hang, and to answer with what it likes.

type Listeners = { [Name in keyof ScreenProtectionEvents]: Set<ScreenProtectionEvents[Name]> };

/** Turning the protection on takes this many turns of the event loop; turning it off takes none. */
const TURNS_TO_ENABLE = 3;

export class FakeScreenProtectionModule implements ScreenProtectionModuleApi {
  /** Whether the protection is on, as the module has applied it. */
  enabled = false;
  /** Every value `setProtectionEnabled` was called with, in order of the calls. */
  readonly calls: boolean[] = [];
  /** What `isCaptured` answers. */
  captured = false;
  /** How many times `isCaptured` was called. */
  captureQueries = 0;

  private readonly listeners: Listeners = {
    onScreenshotTaken: new Set(),
    onCaptureChanged: new Set(),
  };
  private failure: unknown;
  private throwing = false;
  private hanging = false;
  private captureFailure: unknown;
  private addFailure: unknown;
  private removeFailure: unknown;
  private heldCapture: Promise<void> | undefined;

  /** The next calls of `setProtectionEnabled` reject with this, until it is set to `undefined`. */
  rejectWith(failure: unknown): void {
    this.failure = failure;
  }

  /** `setProtectionEnabled` throws instead of returning a promise, like a function that is missing. */
  throwSynchronously(throwing = true): void {
    this.throwing = throwing;
  }

  /** `setProtectionEnabled` never answers while set. */
  hang(hanging = true): void {
    this.hanging = hanging;
  }

  /** `isCaptured` rejects with this while set. */
  rejectCaptureQueryWith(failure: unknown): void {
    this.captureFailure = failure;
  }

  /** `addListener` throws this while set. */
  failToListenWith(failure: unknown): void {
    this.addFailure = failure;
  }

  /** The `remove` of a subscription throws this while set. */
  failToRemoveWith(failure: unknown): void {
    this.removeFailure = failure;
  }

  /** The next `isCaptured` waits for the function returned to be called before it answers. */
  holdNextCaptureQuery(): () => void {
    let release: () => void = () => undefined;
    this.heldCapture = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  /** How many listeners are added for an event. */
  listenerCount(eventName: keyof ScreenProtectionEvents): number {
    return this.listeners[eventName].size;
  }

  /** The system reports a screenshot. */
  emitScreenshot(): void {
    for (const listener of [...this.listeners.onScreenshotTaken]) listener();
  }

  /** The system reports that the capture state changed. */
  emitCapture(payload: CaptureChangedPayload): void {
    for (const listener of [...this.listeners.onCaptureChanged]) listener(payload);
  }

  /** Delivers whatever payload to the listeners of `onCaptureChanged`, well formed or not. */
  emitRawCapture(payload: unknown): void {
    for (const listener of [...this.listeners.onCaptureChanged]) {
      (listener as (payload: unknown) => void)(payload);
    }
  }

  async setProtectionEnabled(enabled: boolean): Promise<void> {
    this.calls.push(enabled);
    if (this.throwing) throw new TypeError('setProtectionEnabled is not a function');
    if (this.hanging) return new Promise<void>(() => undefined);
    for (let turn = 0; enabled && turn < TURNS_TO_ENABLE; turn += 1) await Promise.resolve();
    if (this.failure !== undefined) throw this.failure as Error;
    this.enabled = enabled;
  }

  async isCaptured(): Promise<boolean> {
    this.captureQueries += 1;
    const held = this.heldCapture;
    this.heldCapture = undefined;
    if (held !== undefined) await held;
    if (this.captureFailure !== undefined) throw this.captureFailure as Error;
    return this.captured;
  }

  addListener<Name extends keyof ScreenProtectionEvents>(
    eventName: Name,
    listener: ScreenProtectionEvents[Name],
  ): NativeSubscription {
    if (this.addFailure !== undefined) throw this.addFailure as Error;
    const listeners: Set<ScreenProtectionEvents[Name]> = this.listeners[eventName];
    listeners.add(listener);
    return {
      remove: () => {
        if (this.removeFailure !== undefined) throw this.removeFailure as Error;
        listeners.delete(listener);
      },
    };
  }
}
