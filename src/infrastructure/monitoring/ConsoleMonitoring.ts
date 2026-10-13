import type { AppError } from '@domain/errors/AppError';
import { LOG_LEVEL } from '@application/ports/Monitoring';
import type {
  LogAttributes,
  LogLevel,
  Monitoring,
  MonitoringEvent,
} from '@application/ports/Monitoring';

/** What a console must offer for the monitoring to write to it. The global `console` fits. */
export interface ConsoleSink {
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
}

/** Starts every line, so that the app can be picked out of the noise of the development server. */
const LOG_PREFIX = '[boardroom]';

/**
 * Monitoring for development and for the demo: structured events written to the console. The
 * events and attribute names are the const sets of the port, so the lines can be searched; the
 * errors carry their code and structured fields, which hold no personal data (see the errors). A
 * production adapter wraps a crash reporter instead and replaces this one in the composition root.
 *
 * Fire and forget, as the port requires: nothing is returned, nothing waits, and nothing throws,
 * whatever the console does.
 */
export class ConsoleMonitoring implements Monitoring {
  constructor(private readonly sink: ConsoleSink = console) {}

  log(level: LogLevel, event: MonitoringEvent, attributes?: LogAttributes): void {
    try {
      this.write(level, event, attributes);
    } catch {
      // Monitoring must never break the code it observes.
    }
  }

  captureError(event: MonitoringEvent, error: AppError, attributes?: LogAttributes): void {
    try {
      this.sink.error(LOG_PREFIX, event, error, attributes ?? {});
    } catch {
      // Monitoring must never break the code it observes.
    }
  }

  private write(level: LogLevel, event: MonitoringEvent, attributes?: LogAttributes): void {
    const line = [LOG_PREFIX, event, attributes ?? {}] as const;
    switch (level) {
      case LOG_LEVEL.Info:
        this.sink.info(...line);
        return;
      case LOG_LEVEL.Warn:
        this.sink.warn(...line);
        return;
    }
  }
}
