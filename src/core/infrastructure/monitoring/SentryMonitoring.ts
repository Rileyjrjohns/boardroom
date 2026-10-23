import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent, SeverityLevel } from '@sentry/react-native';

import { LOG_ATTRIBUTE, LOG_LEVEL } from '@core/application/ports/Monitoring';
import type {
  LogAttributes,
  LogLevel,
  Monitoring,
  MonitoringEvent,
} from '@core/application/ports/Monitoring';
import type { AppError } from '@core/domain/errors/AppError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { valuesOf } from '@core/domain/shared/constants';

/**
 * The part of the Sentry SDK this adapter uses. It is a parameter, and not an import used in place,
 * so that the tests hand over a recording stand-in: the real SDK needs its native module and sends
 * what it is given over the network. This file is the only one that imports the package (a lint
 * rule), so the SDK can be replaced by changing this file alone.
 */
export type SentrySdk = Pick<typeof Sentry, 'init' | 'addBreadcrumb' | 'captureException'>;

/** The category of every breadcrumb the app leaves. The breadcrumbs of the SDK have other ones. */
export const BREADCRUMB_CATEGORY = 'boardroom';

/** The names of the tags an error is reported with: the event, and the code of the error. */
export const TAG = {
  Event: 'event',
  ErrorCode: LOG_ATTRIBUTE.ErrorCode,
} as const;

/** The Sentry level of each level of the port. Typed over every level: a new one fails the typecheck. */
const SENTRY_LEVEL_OF_LEVEL = {
  [LOG_LEVEL.Info]: 'info',
  [LOG_LEVEL.Warn]: 'warning',
} as const satisfies Record<LogLevel, SeverityLevel>;

const CAPTURED_ERROR_LEVEL: SeverityLevel = 'error';

/** How many breadcrumbs an error report carries: the last ones tell what led to it. */
const MAX_BREADCRUMBS = 50;

/** Longer text is cut: an attribute is an identifier or a code, never a paragraph. */
const MAX_TEXT_LENGTH = 200;

/** The keys data may be sent under: the attribute names of the port, and nothing else. */
const ALLOWED_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(valuesOf(LOG_ATTRIBUTE));

/** The tags that stay on an event: ours, and the attribute names. */
const ALLOWED_TAG_KEYS: ReadonlySet<string> = new Set([TAG.Event, ...ALLOWED_ATTRIBUTE_KEYS]);

/**
 * The technical contexts the SDK adds, kept; any other context is dropped. Each lists the fields
 * that stay (none of them names a person: the name the user gave to the device is not one).
 */
const KEPT_CONTEXTS: ReadonlyMap<string, ReadonlySet<string> | undefined> = new Map([
  ['app', new Set(['app_identifier', 'app_name', 'app_version', 'app_build', 'in_foreground'])],
  ['os', new Set(['name', 'version', 'build', 'kernel_version'])],
  ['device', new Set(['family', 'model', 'model_id', 'arch', 'simulator', 'orientation'])],
  ['runtime', new Set(['name', 'version'])],
  ['culture', new Set(['locale', 'timezone'])],
  // The trace and span ids: random identifiers, with no field to filter.
  ['trace', undefined],
]);

/** `https://<public key>@<host>/<project id>`, with the optional port and path of a relay. */
const DSN_PATTERN =
  /^https:\/\/[A-Za-z0-9]+(?::[A-Za-z0-9]+)?@[A-Za-z0-9.-]+(?::\d+)?(?:\/[\w.~-]+)*\/\d+$/;

/** Whether the text has the shape of a Sentry DSN. The SDK is the judge of the rest. */
export function isSentryDsn(value: string): boolean {
  return DSN_PATTERN.test(value);
}

type AttributeValue = string | number | boolean;

function isAttributeValue(value: unknown): value is AttributeValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function limited(value: AttributeValue): AttributeValue {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : value;
}

/**
 * What of some data may leave the device: the entries whose key is an attribute name of the port and
 * whose value is a string, a number or a boolean. Everything else is dropped, whoever put it there.
 */
export function allowedAttributes(
  source: Readonly<Record<string, unknown>> | undefined,
): Record<string, AttributeValue> {
  return Object.fromEntries(
    Object.entries(source ?? {}).flatMap(([key, value]): [string, AttributeValue][] =>
      ALLOWED_ATTRIBUTE_KEYS.has(key) && isAttributeValue(value) ? [[key, limited(value)]] : [],
    ),
  );
}

function scrubContext(
  context: Readonly<Record<string, unknown>> | undefined,
  kept: ReadonlySet<string> | undefined,
): Record<string, unknown> {
  if (context === undefined) return {};
  return kept === undefined
    ? { ...context }
    : Object.fromEntries(Object.entries(context).filter(([key]) => kept.has(key)));
}

function scrubContexts(contexts: ErrorEvent['contexts']): NonNullable<ErrorEvent['contexts']> {
  return Object.fromEntries(
    Object.entries(contexts ?? {}).flatMap(
      ([name, context]): [string, Record<string, unknown>][] =>
        KEPT_CONTEXTS.has(name) ? [[name, scrubContext(context, KEPT_CONTEXTS.get(name))]] : [],
    ),
  );
}

function isOwnBreadcrumb(breadcrumb: Breadcrumb): boolean {
  return breadcrumb.category === BREADCRUMB_CATEGORY;
}

/** `beforeBreadcrumb`: the automatic breadcrumbs of the SDK (console, requests, taps) are dropped. */
export function keepOwnBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return isOwnBreadcrumb(breadcrumb)
    ? { ...breadcrumb, data: allowedAttributes(breadcrumb.data) }
    : null;
}

/**
 * `beforeSend`: nothing leaves the device that is not an allowed attribute. Tags, extra data and
 * breadcrumb data keep the attribute names of the port only; the only user field is the id (never an
 * email, a name, an address); the request (URL, headers, cookies) goes; so do the contexts that are
 * not technical. So do the free texts: the message of the event, and the message of an error the app
 * did not report itself (an uncaught exception), which may quote what the code was handling. The
 * type and the stack of such an error stay, which is what a crash is read from.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const own = event.tags?.[TAG.Event] !== undefined;
  const scrubbed: ErrorEvent = {
    ...event,
    tags: Object.fromEntries(
      Object.entries(event.tags ?? {}).filter(([key]) => ALLOWED_TAG_KEYS.has(key)),
    ),
    extra: allowedAttributes(event.extra),
    contexts: scrubContexts(event.contexts),
    breadcrumbs: (event.breadcrumbs ?? []).filter(isOwnBreadcrumb).map((breadcrumb) => ({
      ...breadcrumb,
      data: allowedAttributes(breadcrumb.data),
    })),
  };

  delete scrubbed.request;
  delete scrubbed.server_name;
  delete scrubbed.modules;
  delete scrubbed.user;
  const userId = event.user?.id;
  if (userId !== undefined) scrubbed.user = { id: String(userId) };

  // An exception event has no message of its own; one that does is a free text.
  delete scrubbed.message;
  delete scrubbed.logentry;
  if (!own) {
    const values = event.exception?.values;
    if (values !== undefined) {
      scrubbed.exception = {
        values: values.map(({ value: _value, ...exception }) => exception),
      };
    }
  }
  return scrubbed;
}

/** The options the SDK starts with. A function of the address, for the test that reads them. */
export function sentryOptions(dsn: string): Parameters<SentrySdk['init']>[0] {
  return {
    dsn,
    sendDefaultPii: false,
    // The screens show confidential material: no picture of them, no tree of their views.
    attachScreenshot: false,
    attachViewHierarchy: false,
    // The reports of failed requests quote their URL.
    enableCaptureFailedRequests: false,
    enableAutoPerformanceTracing: false,
    maxBreadcrumbs: MAX_BREADCRUMBS,
    beforeBreadcrumb: keepOwnBreadcrumb,
    beforeSend: scrubEvent,
  };
}

/** The error that is reported: its name is the code, its message the event (and the kind of failure). */
function reportedError(event: MonitoringEvent, error: AppError): Error {
  const cause = 'cause' in error && typeof error.cause === 'string' ? error.cause : undefined;
  const reported = new Error(
    cause === undefined ? event : `${event}: ${cause.slice(0, MAX_TEXT_LENGTH)}`,
  );
  reported.name = error.code;
  return reported;
}

/**
 * Monitoring over Sentry: the logs are breadcrumbs, left on the trail that the next error report
 * carries, and a captured error is an exception reported with its event and its code as tags, and
 * grouped by the two. The attributes of the port are the only data that goes along, and the user is
 * known by the id the port gives, if it gives one. Nothing sent here is a name, an email, a path or
 * a URL: the port forbids it, and `beforeSend` removes whatever else the SDK would add.
 *
 * Fire and forget, as the port requires: nothing is returned and nothing throws, whatever the SDK
 * does.
 */
export class SentryMonitoring implements Monitoring {
  constructor(private readonly sdk: SentrySdk) {}

  log(level: LogLevel, event: MonitoringEvent, attributes?: LogAttributes): void {
    try {
      this.sdk.addBreadcrumb({
        category: BREADCRUMB_CATEGORY,
        message: event,
        level: SENTRY_LEVEL_OF_LEVEL[level],
        data: allowedAttributes(attributes),
      });
    } catch {
      // Monitoring must never break the code it observes.
    }
  }

  captureError(event: MonitoringEvent, error: AppError, attributes?: LogAttributes): void {
    try {
      const data = allowedAttributes(attributes);
      const userId = data[LOG_ATTRIBUTE.UserId];
      this.sdk.captureException(reportedError(event, error), {
        level: CAPTURED_ERROR_LEVEL,
        tags: { [TAG.Event]: event, [TAG.ErrorCode]: error.code },
        extra: data,
        fingerprint: [event, error.code],
        ...(userId === undefined ? {} : { user: { id: String(userId) } }),
      });
    } catch {
      // Monitoring must never break the code it observes.
    }
  }
}

/** Why Sentry could not be started. */
export const SENTRY_START_FAILURE = {
  InvalidDsn: 'invalidDsn',
  SdkFailed: 'sdkFailed',
} as const;

export type SentryStartFailure = (typeof SENTRY_START_FAILURE)[keyof typeof SENTRY_START_FAILURE];

/**
 * Starts the SDK for the address, and gives the monitoring over it; or says why it could not, and
 * never throws. A caller that gets a failure keeps the monitoring it had.
 */
export function createSentryMonitoring(
  dsn: string,
  sdk: SentrySdk = Sentry,
): Result<Monitoring, SentryStartFailure> {
  if (!isSentryDsn(dsn)) return err(SENTRY_START_FAILURE.InvalidDsn);
  try {
    sdk.init(sentryOptions(dsn));
  } catch {
    return err(SENTRY_START_FAILURE.SdkFailed);
  }
  return ok(new SentryMonitoring(sdk));
}
