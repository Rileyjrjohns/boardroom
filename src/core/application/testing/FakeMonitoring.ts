import type { AppError } from '@core/domain/errors/AppError';

import type { LogAttributes, LogLevel, Monitoring, MonitoringEvent } from '../ports/Monitoring';

export interface LogRecord {
  readonly level: LogLevel;
  readonly event: MonitoringEvent;
  readonly attributes: LogAttributes | undefined;
}

export interface ErrorRecord {
  readonly event: MonitoringEvent;
  readonly error: AppError;
  readonly attributes: LogAttributes | undefined;
}

/** Keeps what it is given, so that a test can check what a use case reported. */
export class FakeMonitoring implements Monitoring {
  readonly logs: LogRecord[] = [];
  readonly errors: ErrorRecord[] = [];

  log(level: LogLevel, event: MonitoringEvent, attributes?: LogAttributes): void {
    this.logs.push({ level, event, attributes });
  }

  captureError(event: MonitoringEvent, error: AppError, attributes?: LogAttributes): void {
    this.errors.push({ event, error, attributes });
  }

  /** The events logged so far, in order. */
  loggedEvents(): MonitoringEvent[] {
    return this.logs.map(({ event }) => event);
  }

  /** The events whose error was captured so far, in order. */
  capturedEvents(): MonitoringEvent[] {
    return this.errors.map(({ event }) => event);
  }
}
