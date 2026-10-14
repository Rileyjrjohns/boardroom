import { storageWriteFailed } from '@domain/errors/StorageError';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@application/ports/Monitoring';

import {
  BREADCRUMB_CATEGORY,
  SENTRY_START_FAILURE,
  SentryMonitoring,
  TAG,
  allowedAttributes,
  createSentryMonitoring,
  isSentryDsn,
  keepOwnBreadcrumb,
  scrubEvent,
  sentryOptions,
} from './SentryMonitoring';
import type { SentrySdk } from './SentryMonitoring';

// The real SDK needs its native module and sends what it is given over the network. This wrapper is
// tested against a stand-in that records the three calls it makes; `scrubEvent` and its relatives
// are plain functions, tested as such.
function recordingSdk(overrides: Partial<SentrySdk> = {}) {
  const calls = {
    init: [] as unknown[],
    breadcrumbs: [] as unknown[],
    exceptions: [] as { exception: unknown; context: unknown }[],
  };
  const sdk: SentrySdk = {
    init: (options) => void calls.init.push(options),
    addBreadcrumb: (breadcrumb) => {
      calls.breadcrumbs.push(breadcrumb);
    },
    captureException: (exception, context) => {
      calls.exceptions.push({ exception, context });
      return 'event-id';
    },
    ...overrides,
  };
  return { sdk, calls };
}

const DSN = 'https://0123456789abcdef@o123456.ingest.sentry.io/4500000000';

// The event the SDK hands to `beforeSend`, named from the adapter: only the adapter imports the SDK.
type ErrorEvent = Parameters<typeof scrubEvent>[0];

describe('SentryMonitoring', () => {
  it('turns a log into a breadcrumb with the level of the port, the event and the allowed data', () => {
    const { sdk, calls } = recordingSdk();

    new SentryMonitoring(sdk).log(LOG_LEVEL.Warn, MONITORING_EVENT.CacheEntryDiscarded, {
      [LOG_ATTRIBUTE.MeetingId]: 'meeting-1',
      [LOG_ATTRIBUTE.Attempts]: 2,
    });

    expect(calls.breadcrumbs).toEqual([
      {
        category: BREADCRUMB_CATEGORY,
        message: MONITORING_EVENT.CacheEntryDiscarded,
        level: 'warning',
        data: { meetingId: 'meeting-1', attempts: 2 },
      },
    ]);
  });

  it('logs an event with no attributes as a breadcrumb with no data', () => {
    const { sdk, calls } = recordingSdk();

    new SentryMonitoring(sdk).log(LOG_LEVEL.Info, MONITORING_EVENT.VoteQueued);

    expect(calls.breadcrumbs).toEqual([expect.objectContaining({ level: 'info', data: {} })]);
  });

  it('reports a captured error as an exception named by its code, tagged with the code and the event', () => {
    const { sdk, calls } = recordingSdk();

    new SentryMonitoring(sdk).captureError(
      MONITORING_EVENT.CacheWriteFailed,
      storageWriteFailed('disk full'),
      { [LOG_ATTRIBUTE.Resource]: 'meeting' },
    );

    const [reported] = calls.exceptions;
    expect(reported?.exception).toBeInstanceOf(Error);
    expect(reported?.exception).toMatchObject({
      name: 'storageWriteFailed',
      message: `${MONITORING_EVENT.CacheWriteFailed}: disk full`,
    });
    expect(reported?.context).toEqual({
      level: 'error',
      tags: {
        [TAG.Event]: MONITORING_EVENT.CacheWriteFailed,
        [TAG.ErrorCode]: 'storageWriteFailed',
      },
      extra: { resource: 'meeting' },
      fingerprint: [MONITORING_EVENT.CacheWriteFailed, 'storageWriteFailed'],
    });
  });

  it('names the exception by the event alone when the error has no cause', () => {
    const { sdk, calls } = recordingSdk();

    new SentryMonitoring(sdk).captureError(MONITORING_EVENT.CachePurgeFailed, storageWriteFailed());

    expect(calls.exceptions[0]?.exception).toMatchObject({
      message: MONITORING_EVENT.CachePurgeFailed,
    });
  });

  it('knows the user by the id the port passes, and by nothing else', () => {
    const { sdk, calls } = recordingSdk();

    new SentryMonitoring(sdk).captureError(MONITORING_EVENT.SignOutFailed, storageWriteFailed(), {
      [LOG_ATTRIBUTE.UserId]: 'user-1',
    });

    expect(calls.exceptions[0]?.context).toMatchObject({ user: { id: 'user-1' } });
  });

  it('leaves out the user when the port passes none', () => {
    const { sdk, calls } = recordingSdk();

    new SentryMonitoring(sdk).captureError(MONITORING_EVENT.SignOutFailed, storageWriteFailed());

    expect(calls.exceptions[0]?.context).not.toHaveProperty('user');
  });

  it('drops an attribute that is not one of the port, even when it is passed', () => {
    const { sdk, calls } = recordingSdk();
    // A call site cannot write this (the type forbids it); a cast stands for a bug that does.
    const sneaky = { [LOG_ATTRIBUTE.Resource]: 'meeting', email: 'ada@example.com' } as never;

    new SentryMonitoring(sdk).log(LOG_LEVEL.Info, MONITORING_EVENT.VoteQueued, sneaky);
    new SentryMonitoring(sdk).captureError(
      MONITORING_EVENT.CacheReadFailed,
      storageWriteFailed(),
      sneaky,
    );

    expect(JSON.stringify(calls)).not.toContain('ada@example.com');
    expect(calls.breadcrumbs).toEqual([expect.objectContaining({ data: { resource: 'meeting' } })]);
  });

  it('never throws, whatever the SDK does', () => {
    const failing = recordingSdk({
      addBreadcrumb: () => {
        throw new Error('sdk down');
      },
      captureException: () => {
        throw new Error('sdk down');
      },
    });
    const monitoring = new SentryMonitoring(failing.sdk);

    expect(() => monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.VoteQueued)).not.toThrow();
    expect(() =>
      monitoring.captureError(MONITORING_EVENT.CacheReadFailed, storageWriteFailed()),
    ).not.toThrow();
  });
});

describe('allowedAttributes', () => {
  it('keeps the attribute names of the port with a string, a number or a boolean', () => {
    expect(
      allowedAttributes({
        userId: 'user-1',
        attempts: 3,
        synced: true,
        email: 'ada@example.com',
        meetingId: { nested: 'object' },
        resource: undefined,
      }),
    ).toEqual({ userId: 'user-1', attempts: 3, synced: true });
  });

  it('cuts a long text, and accepts no data at all', () => {
    expect(allowedAttributes({ issuePaths: 'x'.repeat(500) }).issuePaths).toHaveLength(200);
    expect(allowedAttributes(undefined)).toEqual({});
  });
});

describe('keepOwnBreadcrumb', () => {
  it('keeps the breadcrumbs of the app, with the allowed data only', () => {
    expect(
      keepOwnBreadcrumb({
        category: BREADCRUMB_CATEGORY,
        message: MONITORING_EVENT.VoteQueued,
        data: { resolutionId: 'r-1', url: 'https://api.example.com/votes/secret' },
      }),
    ).toEqual({
      category: BREADCRUMB_CATEGORY,
      message: MONITORING_EVENT.VoteQueued,
      data: { resolutionId: 'r-1' },
    });
  });

  it.each(['console', 'xhr', 'fetch', 'navigation', 'ui.click'])(
    'drops the automatic %s breadcrumb of the SDK',
    (category) => {
      expect(keepOwnBreadcrumb({ category, message: 'GET https://api.example.com/me' })).toBeNull();
    },
  );
});

describe('scrubEvent', () => {
  const crash: ErrorEvent = {
    type: undefined,
    event_id: 'abc',
    level: 'fatal',
    message: 'Cannot read email of ada@example.com',
    request: { url: 'https://api.example.com/meetings/m-1?token=secret', cookies: { sid: 'x' } },
    server_name: 'Ada’s iPhone',
    modules: { left: '1.0.0' },
    user: { id: 'user-1', email: 'ada@example.com', username: 'ada', ip_address: '10.0.0.7' },
    tags: {
      event: MONITORING_EVENT.CacheWriteFailed,
      resource: 'meeting',
      note: 'ada@example.com',
    },
    extra: { meetingId: 'm-1', title: 'Board meeting of the merger', attempts: 2 },
    contexts: {
      device: { model: 'Pixel 9', name: 'Ada’s Pixel', simulator: false },
      os: { name: 'Android', version: '16' },
      document: { text: 'confidential' },
    },
    breadcrumbs: [
      { category: 'fetch', data: { url: 'https://api.example.com/documents/d-1' } },
      { category: 'console', message: 'user ada@example.com signed in' },
      {
        category: BREADCRUMB_CATEGORY,
        message: 'voteQueued',
        data: { resolutionId: 'r-1', who: 'ada' },
      },
    ],
    exception: {
      values: [{ type: 'storageWriteFailed', value: 'cacheWriteFailed: disk full' }],
    },
  };

  it('keeps nothing that is not an allowed attribute', () => {
    const scrubbed = scrubEvent(crash);

    expect(scrubbed.tags).toEqual({
      event: MONITORING_EVENT.CacheWriteFailed,
      resource: 'meeting',
    });
    expect(scrubbed.extra).toEqual({ meetingId: 'm-1', attempts: 2 });
    expect(scrubbed.breadcrumbs).toEqual([
      { category: BREADCRUMB_CATEGORY, message: 'voteQueued', data: { resolutionId: 'r-1' } },
    ]);
  });

  it('keeps the id of the user and no other field of it', () => {
    expect(scrubEvent(crash).user).toEqual({ id: 'user-1' });
    expect(scrubEvent({ ...crash, user: { email: 'ada@example.com' } })).not.toHaveProperty('user');
    expect(scrubEvent({ type: undefined })).not.toHaveProperty('user');
  });

  it('removes the request, the server name and the modules', () => {
    const scrubbed = scrubEvent(crash);

    expect(scrubbed).not.toHaveProperty('request');
    expect(scrubbed).not.toHaveProperty('server_name');
    expect(scrubbed).not.toHaveProperty('modules');
  });

  it('keeps the technical contexts, field by field, and drops the others', () => {
    expect(scrubEvent(crash).contexts).toEqual({
      device: { model: 'Pixel 9', simulator: false },
      os: { name: 'Android', version: '16' },
    });
  });

  it('keeps the whole trace context, which holds random ids and nothing else', () => {
    expect(
      scrubEvent({ ...crash, contexts: { trace: { trace_id: 't', span_id: 's' } } }).contexts,
    ).toEqual({ trace: { trace_id: 't', span_id: 's' } });
  });

  it('keeps the message of an error the app reported, and drops the one of an error it did not', () => {
    expect(scrubEvent(crash).exception?.values).toEqual([
      { type: 'storageWriteFailed', value: 'cacheWriteFailed: disk full' },
    ]);

    const uncaught = scrubEvent({
      ...crash,
      tags: {},
      exception: { values: [{ type: 'TypeError', value: "Cannot read 'email' of Ada" }] },
    });
    expect(uncaught.exception?.values).toEqual([{ type: 'TypeError' }]);
    expect(uncaught).not.toHaveProperty('message');
  });

  it('leaves nothing of the personal data of the event in what it returns', () => {
    const serialised = JSON.stringify(scrubEvent(crash));

    for (const secret of [
      'ada@example.com',
      'Ada',
      'token=secret',
      '10.0.0.7',
      'merger',
      'confidential',
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('copes with an event that has none of the optional parts', () => {
    expect(scrubEvent({ type: undefined })).toEqual({
      tags: {},
      extra: {},
      contexts: {},
      breadcrumbs: [],
    });
  });
});

describe('isSentryDsn', () => {
  it.each([
    DSN,
    'https://abc@sentry.example.com:9000/relay/12',
    'https://abc:def@o1.ingest.de.sentry.io/1',
  ])('accepts %s', (dsn) => {
    expect(isSentryDsn(dsn)).toBe(true);
  });

  it.each([
    '',
    'not a url',
    'http://abc@o1.ingest.sentry.io/1',
    'https://o1.ingest.sentry.io/1',
    'https://abc@o1.ingest.sentry.io/',
    'https://abc@o1.ingest.sentry.io/project',
    'https://abc@o1.ingest.sentry.io/1 extra',
  ])('refuses "%s"', (dsn) => {
    expect(isSentryDsn(dsn)).toBe(false);
  });
});

describe('sentryOptions', () => {
  it('starts with the address, no default personal data, no screenshot and the scrubbing hooks', () => {
    const options = sentryOptions(DSN);

    expect(options).toMatchObject({
      dsn: DSN,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
      beforeSend: scrubEvent,
      beforeBreadcrumb: keepOwnBreadcrumb,
    });
    expect(options).not.toHaveProperty('tracesSampleRate');
  });
});

describe('createSentryMonitoring', () => {
  it('starts the SDK with the options and answers the monitoring over it', () => {
    const { sdk, calls } = recordingSdk();

    const created = createSentryMonitoring(DSN, sdk);

    expect(calls.init).toEqual([sentryOptions(DSN)]);
    expect(created.ok && created.value).toBeInstanceOf(SentryMonitoring);
  });

  it('refuses an address that is not a DSN, without starting the SDK', () => {
    const { sdk, calls } = recordingSdk();

    expect(createSentryMonitoring('nonsense', sdk)).toEqual({
      ok: false,
      error: SENTRY_START_FAILURE.InvalidDsn,
    });
    expect(calls.init).toEqual([]);
  });

  it('answers a failure, and does not throw, when the SDK cannot start', () => {
    const { sdk } = recordingSdk({
      init: () => {
        throw new Error('native module missing');
      },
    });

    expect(createSentryMonitoring(DSN, sdk)).toEqual({
      ok: false,
      error: SENTRY_START_FAILURE.SdkFailed,
    });
  });
});
