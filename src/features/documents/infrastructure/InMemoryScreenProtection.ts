import type { Unsubscribe } from '@core/application/ports/types/Unsubscribe';
import type { ScreenProtectionError } from '@core/domain/errors/ScreenProtectionError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type {
  ScreenCaptureEvent,
  ScreenProtection,
} from '@features/documents/application/ports/ScreenProtection';

/**
 * The screen protection of the mock configuration. It blocks nothing: it records whether it was
 * turned on, so that the demo and the tests can see what the application asked for, and it can be
 * made to fail or to report a capture. The native adapter arrives with the native module step.
 */
export class InMemoryScreenProtection implements ScreenProtection {
  private enabled = false;
  private enableFailure: ScreenProtectionError | undefined;
  private disableFailure: ScreenProtectionError | undefined;
  private readonly listeners = new Set<(event: ScreenCaptureEvent) => void>();

  /** Whether the protection is currently on. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Makes `enable` fail with this error while set (the protection stays off). */
  failEnableWith(failure: ScreenProtectionError | undefined): void {
    this.enableFailure = failure;
  }

  /** Makes `disable` fail with this error while set (the protection stays as it was). */
  failDisableWith(failure: ScreenProtectionError | undefined): void {
    this.disableFailure = failure;
  }

  /** Simulates the system reporting a capture to everybody who subscribed. */
  emit(event: ScreenCaptureEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  enable(): Promise<Result<void, ScreenProtectionError>> {
    if (this.enableFailure !== undefined) return Promise.resolve(err(this.enableFailure));
    this.enabled = true;
    return Promise.resolve(ok(undefined));
  }

  disable(): Promise<Result<void, ScreenProtectionError>> {
    if (this.disableFailure !== undefined) return Promise.resolve(err(this.disableFailure));
    this.enabled = false;
    return Promise.resolve(ok(undefined));
  }

  subscribe(listener: (event: ScreenCaptureEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
