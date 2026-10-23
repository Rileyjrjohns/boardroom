import type { Unsubscribe } from '@core/application/ports/types/Unsubscribe';
import type { ScreenProtectionError } from '@core/domain/errors/ScreenProtectionError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import type { ScreenCaptureEvent, ScreenProtection } from '../ports/ScreenProtection';

/** A platform that supports screen protection, until the test says otherwise. */
export class FakeScreenProtection implements ScreenProtection {
  /** Whether the protection is currently on. */
  enabled = false;
  /** Makes `enable` fail while set (the protection stays off). */
  enableFailure: ScreenProtectionError | undefined;
  /** Makes `disable` fail while set (the protection stays as it was). */
  disableFailure: ScreenProtectionError | undefined;

  enableCalls = 0;
  disableCalls = 0;

  private readonly listeners = new Set<(event: ScreenCaptureEvent) => void>();

  enable(): Promise<Result<void, ScreenProtectionError>> {
    this.enableCalls += 1;
    if (this.enableFailure !== undefined) {
      return Promise.resolve(err(this.enableFailure));
    }
    this.enabled = true;
    return Promise.resolve(ok(undefined));
  }

  disable(): Promise<Result<void, ScreenProtectionError>> {
    this.disableCalls += 1;
    if (this.disableFailure !== undefined) {
      return Promise.resolve(err(this.disableFailure));
    }
    this.enabled = false;
    return Promise.resolve(ok(undefined));
  }

  subscribe(listener: (event: ScreenCaptureEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Simulates the system reporting a capture. */
  emit(event: ScreenCaptureEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
