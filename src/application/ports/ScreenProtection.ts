import type { ValueOf } from '@domain/shared/constants';
import type { ScreenProtectionError } from '@domain/errors/ScreenProtectionError';
import type { Result } from '@domain/shared/Result';

/** What the system reports about the screen being captured. */
export const SCREEN_CAPTURE_KIND = {
  ScreenshotTaken: 'screenshotTaken',
  RecordingStarted: 'recordingStarted',
  RecordingStopped: 'recordingStopped',
} as const;

export type ScreenCaptureKind = ValueOf<typeof SCREEN_CAPTURE_KIND>;

export interface ScreenCaptureEvent {
  readonly kind: ScreenCaptureKind;
}

/** Stops a subscription. Calling it again does nothing. */
export type Unsubscribe = () => void;

/**
 * Blocks screenshots and screen recording while a confidential screen is shown, and reports
 * attempts.
 *
 * The port is deliberately dumb: it is one global switch with no memory of who asked for it. Which
 * documents need it, and when the last one has gone, is decided by the application
 * (`ScreenProtectionCoordinator`), so that every adapter behaves the same.
 *
 * Contract: no method throws or rejects, and `enable` and `disable` settle in bounded time. They
 * are idempotent. `enable` has taken effect when it resolves: a screen shown after it is protected
 * (a capture started afterwards is blocked, and the app switcher shows no content). Calls are
 * applied in the order they were issued, so a `disable` issued before an `enable` can never land
 * after it; the application also serialises its own calls (`ScreenProtectionCoordinator`). A
 * listener must not throw; the adapter calls it for each event until it is unsubscribed.
 */
export interface ScreenProtection {
  /** Turns the protection on. Fails when the platform cannot provide it. */
  enable(): Promise<Result<void, ScreenProtectionError>>;

  /** Turns the protection off. Succeeds when it was already off. */
  disable(): Promise<Result<void, ScreenProtectionError>>;

  /** Calls `listener` for each capture event, until the returned function is called. */
  subscribe(listener: (event: ScreenCaptureEvent) => void): Unsubscribe;
}
