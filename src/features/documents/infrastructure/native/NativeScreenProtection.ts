import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import type { Unsubscribe } from '@core/application/ports/types/Unsubscribe';
import {
  screenProtectionFailed,
  screenProtectionUnsupported,
} from '@core/domain/errors/ScreenProtectionError';
import type { ScreenProtectionError } from '@core/domain/errors/ScreenProtectionError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { attempt, describeFailure } from '@core/infrastructure/shared/attempt';
import { createSerialQueue } from '@core/infrastructure/shared/serialQueue';
import { createSubscribers } from '@core/infrastructure/shared/subscribers';
import { SCREEN_CAPTURE_KIND } from '@features/documents/application/ports/ScreenProtection';
import type {
  ScreenCaptureEvent,
  ScreenProtection,
} from '@features/documents/application/ports/ScreenProtection';

import { NATIVE_EVENT } from './ScreenProtectionModuleApi';
import type { NativeSubscription, ScreenProtectionModuleApi } from './ScreenProtectionModuleApi';

/** How long the native module may take to turn the protection on or off, or to say how the screen is. */
const DEFAULT_NATIVE_TIMEOUT_MILLIS = 5_000;

const SCREENSHOT: ScreenCaptureEvent = { kind: SCREEN_CAPTURE_KIND.ScreenshotTaken };
const RECORDING_STARTED: ScreenCaptureEvent = { kind: SCREEN_CAPTURE_KIND.RecordingStarted };
const RECORDING_STOPPED: ScreenCaptureEvent = { kind: SCREEN_CAPTURE_KIND.RecordingStopped };

export interface NativeScreenProtectionOptions {
  /** The native module, or `undefined` when the build has none: the platform cannot protect. */
  readonly module: ScreenProtectionModuleApi | undefined;
  /** Told when the native side fails, and when a listener throws, which it must not. */
  readonly monitoring: Monitoring;
  /** Defaults to `DEFAULT_NATIVE_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/**
 * The `ScreenProtection` port over the native module of the app (`modules/screen-protection`).
 *
 * - **Enable and disable** go to the module one at a time, in the order they were issued, so a
 *   `disable` issued first can never land after an `enable`. Each is bounded in time. A module that
 *   fails, throws, does not answer or is not there is a `screenProtectionFailed` or, for a missing
 *   module, `screenProtectionUnsupported` result: nothing escapes, and a failure is also captured
 *   by the monitoring, with the kind of failure and nothing else. Disabling something that cannot
 *   be enabled succeeds: it is off.
 * - **Capture events** are the module's, mapped to the domain's: a screenshot, and a recording that
 *   starts or stops (`onCaptureChanged`). The listeners of the module exist only while someone is
 *   subscribed, one for every subscriber together. A change is told once: a report that repeats the
 *   known state is dropped.
 * - **A recording that is already running** when someone starts listening is told to them as a
 *   `recordingStarted`, from `isCaptured`: the module reports changes, and a document opened while
 *   the screen is recorded needs to know. A change that arrives first wins over that answer.
 *
 * Every call of `subscribe` is a subscription of its own, and a listener that throws is captured
 * and does not stop the others (`createSubscribers`).
 */
export class NativeScreenProtection implements ScreenProtection {
  private readonly queue = createSerialQueue();
  private readonly onListenerError = (error: unknown): void => {
    this.options.monitoring.captureError(
      MONITORING_EVENT.ScreenProtectionListenerFailed,
      screenProtectionFailed(),
      { [LOG_ATTRIBUTE.Reason]: describeFailure(error) },
    );
  };
  private readonly subscribers = createSubscribers<ScreenCaptureEvent>(this.onListenerError);

  private nativeListeners: NativeSubscription[] = [];
  private listening = false;
  /** Whether the screen is captured, as far as is known; only while listening. */
  private captured: boolean | undefined;
  /** Tells a listening that ended from the one that replaced it, for the answers that come late. */
  private session = 0;

  constructor(private readonly options: NativeScreenProtectionOptions) {}

  enable(): Promise<Result<void, ScreenProtectionError>> {
    return this.queue(() => this.setEnabled(true));
  }

  disable(): Promise<Result<void, ScreenProtectionError>> {
    return this.queue(() => this.setEnabled(false));
  }

  subscribe(listener: (event: ScreenCaptureEvent) => void): Unsubscribe {
    let active = true;
    const stop = this.subscribers.subscribe(listener);
    if (!this.listening) this.startListening();
    else if (this.captured === true) {
      // The recording began before this subscriber came: tell it, once its subscription is made.
      void Promise.resolve().then(() => {
        if (active) this.deliver(listener, RECORDING_STARTED);
      });
    }

    return () => {
      active = false;
      stop();
      if (this.subscribers.size === 0) this.stopListening();
    };
  }

  private async setEnabled(enabled: boolean): Promise<Result<void, ScreenProtectionError>> {
    const { module, monitoring } = this.options;
    if (module === undefined) return enabled ? err(screenProtectionUnsupported()) : ok(undefined);

    const done = await attempt(() => module.setProtectionEnabled(enabled), this.timeout());
    if (done.ok) return ok(undefined);

    monitoring.captureError(
      MONITORING_EVENT.ScreenProtectionNativeFailed,
      screenProtectionFailed(),
      {
        [LOG_ATTRIBUTE.Reason]: done.error.cause,
      },
    );
    return err(screenProtectionFailed());
  }

  private startListening(): void {
    this.listening = true;
    this.captured = undefined;
    this.session += 1;

    const { module } = this.options;
    if (module === undefined) return;

    this.listenTo(() =>
      module.addListener(NATIVE_EVENT.ScreenshotTaken, () => {
        if (this.listening) this.subscribers.notify(SCREENSHOT);
      }),
    );
    this.listenTo(() =>
      module.addListener(NATIVE_EVENT.CaptureChanged, (payload) => {
        this.onCaptureChanged(payload);
      }),
    );
    void this.readInitialCapture(module, this.session);
  }

  private stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    this.captured = undefined;
    const listeners = this.nativeListeners;
    this.nativeListeners = [];
    for (const listener of listeners) {
      try {
        listener.remove();
      } catch (error) {
        this.reportNativeFailure(error);
      }
    }
  }

  /** Adds a native listener. One that cannot be added only means that event never comes. */
  private listenTo(add: () => NativeSubscription): void {
    try {
      this.nativeListeners.push(add());
    } catch (error) {
      this.reportNativeFailure(error);
    }
  }

  private onCaptureChanged(payload: unknown): void {
    if (!this.listening) return;
    const captured = capturedOf(payload);
    if (captured === undefined || captured === this.captured) return;
    this.captured = captured;
    this.subscribers.notify(captured ? RECORDING_STARTED : RECORDING_STOPPED);
  }

  /** Learns whether a recording is already running, unless a change has told so first. */
  private async readInitialCapture(
    module: ScreenProtectionModuleApi,
    session: number,
  ): Promise<void> {
    const asked = await attempt(() => module.isCaptured(), this.timeout());
    if (!asked.ok || typeof asked.value !== 'boolean') return;
    if (!this.listening || session !== this.session || this.captured !== undefined) return;

    this.captured = asked.value;
    if (asked.value) this.subscribers.notify(RECORDING_STARTED);
  }

  private deliver(listener: (event: ScreenCaptureEvent) => void, event: ScreenCaptureEvent): void {
    const only = createSubscribers<ScreenCaptureEvent>(this.onListenerError);
    only.subscribe(listener);
    only.notify(event);
  }

  private reportNativeFailure(error: unknown): void {
    this.options.monitoring.captureError(
      MONITORING_EVENT.ScreenProtectionNativeFailed,
      screenProtectionFailed(),
      { [LOG_ATTRIBUTE.Reason]: describeFailure(error) },
    );
  }

  private timeout(): number {
    return this.options.timeoutMillis ?? DEFAULT_NATIVE_TIMEOUT_MILLIS;
  }
}

/** The state a payload of `onCaptureChanged` carries, or `undefined` for one that carries none. */
function capturedOf(payload: unknown): boolean | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const { captured } = payload as { captured?: unknown };
  return typeof captured === 'boolean' ? captured : undefined;
}
