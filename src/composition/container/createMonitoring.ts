import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { ConsoleMonitoring } from '@core/infrastructure/monitoring/ConsoleMonitoring';
import { createSentryMonitoring } from '@core/infrastructure/monitoring/SentryMonitoring';
import type { SentrySdk } from '@core/infrastructure/monitoring/SentryMonitoring';

/**
 * The monitoring of the app, from the address (DSN) of the crash reporter that the build was given
 * (`EXPO_PUBLIC_SENTRY_DSN`). Off by default: with no address, or a blank one, the events go to the
 * console, as they do in development. With one, they go to Sentry.
 *
 * An address that is not valid, or an SDK that does not start, never stops the app: monitoring must
 * not decide whether the app runs. The console stays, and says why once, with the reason and no
 * address (it is not a secret, but it names the project). The SDK is a parameter for the tests.
 */
export function createMonitoring(dsn: string | undefined, sdk?: SentrySdk): Monitoring {
  const address = (dsn ?? '').trim();
  const console = new ConsoleMonitoring();
  if (address === '') return console;

  const sentry = createSentryMonitoring(address, sdk);
  if (sentry.ok) return sentry.value;

  console.log(LOG_LEVEL.Warn, MONITORING_EVENT.MonitoringNotStarted, {
    [LOG_ATTRIBUTE.Reason]: sentry.error,
  });
  return console;
}
