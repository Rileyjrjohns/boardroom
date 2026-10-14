import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { storageWriteFailed } from '@domain/errors/StorageError';
import { aDuration } from '@domain/testing/builders';
import { ConsoleMonitoring } from '@infrastructure/monitoring/ConsoleMonitoring';
import {
  SENTRY_START_FAILURE,
  SentryMonitoring,
} from '@infrastructure/monitoring/SentryMonitoring';
import type { SentrySdk } from '@infrastructure/monitoring/SentryMonitoring';
import { immediateSleep } from '@infrastructure/testing/sleep';
import { testFileStore } from '@infrastructure/testing/testFiles';
import { FakeClock } from '@application/testing/FakeClock';

import { ADAPTERS } from './adapters';
import { defaultMockConfiguration, parseConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { createContainer, startContainer } from './createContainer';
import { createMonitoring } from './createMonitoring';

// The real SDK needs its native module and sends what it is given over the network: these tests
// hand the wiring a stand-in that records the calls, which is all they need to see.
type InitOptions = Parameters<SentrySdk['init']>[0];

function recordingSdk(init?: SentrySdk['init']) {
  const inits: InitOptions[] = [];
  const exceptions: unknown[] = [];
  const sdk: SentrySdk = {
    init: init ?? ((options) => void inits.push(options)),
    addBreadcrumb: () => undefined,
    captureException: (exception) => {
      exceptions.push(exception);
      return 'event-id';
    },
  };
  return { sdk, inits, exceptions };
}

const DSN = 'https://0123456789abcdef@o123456.ingest.sentry.io/4500000000';

describe('createMonitoring', () => {
  it.each([undefined, '', '   '])('is the console when the address is %j', (dsn) => {
    const { sdk, inits } = recordingSdk();

    expect(createMonitoring(dsn, sdk)).toBeInstanceOf(ConsoleMonitoring);
    expect(inits).toEqual([]);
  });

  it('is Sentry when there is an address, started with that address and the scrubbing', () => {
    const { sdk, inits } = recordingSdk();

    const monitoring = createMonitoring(`  ${DSN}  `, sdk);

    expect(monitoring).toBeInstanceOf(SentryMonitoring);
    expect(inits).toHaveLength(1);
    expect(inits[0]).toMatchObject({ dsn: DSN, sendDefaultPii: false });
    expect(inits[0]?.beforeSend).toBeInstanceOf(Function);
  });

  it('reports the events it is given through the SDK, and not to the console', () => {
    const { sdk, exceptions } = recordingSdk();
    const warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    createMonitoring(DSN, sdk).captureError(
      MONITORING_EVENT.CacheWriteFailed,
      storageWriteFailed(),
    );

    expect(exceptions).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('hands the SDK a scrubbing that removes what is not an allowed attribute', async () => {
    const { sdk, inits } = recordingSdk();
    createMonitoring(DSN, sdk);

    const beforeSend = inits[0]?.beforeSend;
    const sent = await beforeSend?.(
      {
        type: undefined,
        user: { id: 'user-1', email: 'ada@example.com' },
        extra: { meetingId: 'm-1', title: 'Merger' },
        request: { url: 'https://api.example.com/meetings/m-1' },
      },
      {},
    );

    expect(sent).toEqual(
      expect.objectContaining({ user: { id: 'user-1' }, extra: { meetingId: 'm-1' } }),
    );
    expect(sent).not.toHaveProperty('request');
  });

  it.each([
    ['an address that is not a DSN', 'nonsense', SENTRY_START_FAILURE.InvalidDsn],
    ['an SDK that does not start', DSN, SENTRY_START_FAILURE.SdkFailed],
  ])('stays on the console, and says why, for %s', (_name, dsn, reason) => {
    const { sdk } = recordingSdk(() => {
      throw new Error('native module missing');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const monitoring = createMonitoring(dsn, sdk);

    expect(monitoring).toBeInstanceOf(ConsoleMonitoring);
    expect(warn).toHaveBeenCalledWith(expect.any(String), MONITORING_EVENT.MonitoringNotStarted, {
      [LOG_ATTRIBUTE.Reason]: reason,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(DSN);
    warn.mockRestore();
  });
});

describe('the Sentry address in the configuration', () => {
  const settings = { adapters: ADAPTERS.Mock, apiBaseUrl: undefined };

  it('is left out when there is none, so that nothing changes for a build without one', () => {
    expect(parseConfiguration(settings, { development: true })).toEqual({
      ok: true,
      value: defaultMockConfiguration(),
    });
    expect(parseConfiguration({ ...settings, sentryDsn: '  ' }, { development: true })).toEqual({
      ok: true,
      value: defaultMockConfiguration(),
    });
  });

  it.each([ADAPTERS.Mock, ADAPTERS.Http])('is kept, trimmed, with the %s adapters', (adapters) => {
    const parsed = parseConfiguration(
      { adapters, apiBaseUrl: 'https://api.example.com', sentryDsn: ` ${DSN} ` },
      { development: false },
    );

    expect(parsed.ok && parsed.value).toMatchObject({ kind: adapters, sentryDsn: DSN });
  });

  it('does not make a bad address a reason not to start', () => {
    expect(
      parseConfiguration({ ...settings, sentryDsn: 'nonsense' }, { development: true }).ok,
    ).toBe(true);
  });
});

describe('the container, given an address', () => {
  const runtime = (overrides: Partial<ContainerRuntime> = {}): ContainerRuntime => ({
    clock: new FakeClock(),
    sleep: immediateSleep,
    fileStore: testFileStore(),
    biometricPromptText: (reason) => ({ message: reason, cancelLabel: 'cancel' }),
    ...overrides,
  });
  const mock = { ...defaultMockConfiguration(), latency: aDuration(0) };

  it('starts Sentry once, with that address', async () => {
    const { sdk, inits } = recordingSdk();

    const created = await createContainer({ ...mock, sentryDsn: DSN }, runtime({ sentrySdk: sdk }));

    expect(created.ok).toBe(true);
    expect(inits.map((options) => options?.dsn)).toEqual([DSN]);
  });

  it('starts nothing without an address', async () => {
    const { sdk, inits } = recordingSdk();
    const quiet = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    const created = await createContainer(mock, runtime({ sentrySdk: sdk }));

    expect(created.ok).toBe(true);
    expect(inits).toEqual([]);
    quiet.mockRestore();
  });

  it('keeps the monitoring the runtime hands over, address or not', async () => {
    const { sdk, inits } = recordingSdk();

    const created = await createContainer(
      { ...mock, sentryDsn: DSN },
      runtime({ sentrySdk: sdk, monitoring: new FakeMonitoring() }),
    );

    expect(created.ok).toBe(true);
    expect(inits).toEqual([]);
  });

  it('is started from the raw settings of the root layout', async () => {
    const { sdk, inits } = recordingSdk();

    const started = await startContainer(
      { adapters: ADAPTERS.Mock, apiBaseUrl: undefined, sentryDsn: DSN },
      { development: true },
      runtime({ sentrySdk: sdk }),
    );

    expect(started.ok).toBe(true);
    expect(inits.map((options) => options?.dsn)).toEqual([DSN]);
  });
});
