import { aDuration } from '@domain/testing/builders';

import { CONTAINER_ERROR_CODE } from './errors';
import { ADAPTERS } from './adapters';
import {
  ALLOW_DEVICE_PASSCODE_FALLBACK,
  HTTP_REQUEST_TIMEOUT,
  MAX_HTTP_REQUEST_TIMEOUT,
  MIN_HTTP_REQUEST_TIMEOUT,
  MOCK_SESSION_LIFETIME,
  MOCK_STARTS_SIGNED_IN,
  SIMULATED_LATENCY,
} from './config';
import { defaultMockConfiguration, parseConfiguration } from './configuration';
import type { RawSettings } from './configuration';

describe('defaultMockConfiguration', () => {
  it('is the mock configuration with the values of the configuration module', () => {
    expect(defaultMockConfiguration()).toEqual({
      kind: ADAPTERS.Mock,
      startSignedIn: MOCK_STARTS_SIGNED_IN,
      latency: SIMULATED_LATENCY,
      sessionLifetime: MOCK_SESSION_LIFETIME,
    });
  });

  it('starts signed out: the user signs in, as with the real adapters', () => {
    expect(defaultMockConfiguration().startSignedIn).toBe(false);
  });
});

const DEVELOPMENT = { development: true };
const RELEASE = { development: false };
const API = 'https://api.boardroom.example';

/** The settings of the environment, with the address of an API unless the test says otherwise. */
const settings = (overrides: Partial<RawSettings> = {}): RawSettings => ({
  adapters: undefined,
  apiBaseUrl: API,
  ...overrides,
});

describe('parseConfiguration, the adapters', () => {
  it.each([
    ['nothing is set', undefined],
    ['the variable is empty', ''],
    ['the variable is blank', '   '],
  ])('defaults to the mock configuration in a development build when %s', (_name, raw) => {
    expect(parseConfiguration(settings({ adapters: raw }), DEVELOPMENT)).toEqual({
      ok: true,
      value: defaultMockConfiguration(),
    });
  });

  it.each(['mock', 'MOCK', '  Mock \n'])('reads %j as the mock configuration', (raw) => {
    expect(parseConfiguration(settings({ adapters: raw }), DEVELOPMENT)).toEqual({
      ok: true,
      value: defaultMockConfiguration(),
    });
  });

  it('starts the mock configuration signed in when it is told to, and ignores the address of the API', () => {
    expect(
      parseConfiguration(
        settings({ adapters: 'mock', apiBaseUrl: 'not even a url', mockStartsSignedIn: true }),
        RELEASE,
      ),
    ).toEqual({ ok: true, value: { ...defaultMockConfiguration(), startSignedIn: true } });
  });

  it.each(['http', 'HTTP', ' http '])('reads %j as the http configuration', (raw) => {
    expect(parseConfiguration(settings({ adapters: raw }), DEVELOPMENT)).toEqual({
      ok: true,
      value: {
        kind: ADAPTERS.Http,
        baseUrl: API,
        requestTimeout: HTTP_REQUEST_TIMEOUT,
        allowDevicePasscode: ALLOW_DEVICE_PASSCODE_FALLBACK,
      },
    });
  });

  it.each(['moc', 'mock,http', 'real', '0', 'null'])(
    'refuses %j instead of falling back to the mock configuration',
    (raw) => {
      expect(parseConfiguration(settings({ adapters: raw }), DEVELOPMENT)).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: raw },
      });
    },
  );

  it('reports what it found, trimmed', () => {
    expect(parseConfiguration(settings({ adapters: '  staging ' }), DEVELOPMENT)).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: 'staging' },
    });
  });

  describe('outside of a development build', () => {
    it.each([
      ['nothing is set', undefined],
      ['the variable is empty', ''],
      ['the variable is blank', '   '],
    ])('refuses to start on the mock adapters when %s', (_name, raw) => {
      expect(parseConfiguration(settings({ adapters: raw }), RELEASE)).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.MissingAdaptersSetting },
      });
    });

    it('accepts the settings it knows, like a development build does', () => {
      expect(parseConfiguration(settings({ adapters: 'mock' }), RELEASE).ok).toBe(true);
      expect(parseConfiguration(settings({ adapters: 'http' }), RELEASE).ok).toBe(true);
    });

    it('refuses a setting it does not know, like a development build does', () => {
      expect(parseConfiguration(settings({ adapters: 'staging' }), RELEASE)).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: 'staging' },
      });
    });
  });
});

describe('parseConfiguration, the settings of the http adapters', () => {
  const http = (overrides: Partial<RawSettings>, environment = DEVELOPMENT) =>
    parseConfiguration(settings({ adapters: 'http', ...overrides }), environment);

  it('normalises the address of the API', () => {
    expect(http({ apiBaseUrl: '  HTTPS://API.Boardroom.example/v1/  ' })).toMatchObject({
      ok: true,
      value: { baseUrl: 'https://api.boardroom.example/v1' },
    });
  });

  it.each([
    ['nothing', undefined, CONTAINER_ERROR_CODE.MissingApiBaseUrl],
    ['a blank value', '  ', CONTAINER_ERROR_CODE.MissingApiBaseUrl],
    [
      'something that is not a URL',
      'api.boardroom.example',
      CONTAINER_ERROR_CODE.InvalidApiBaseUrl,
    ],
    [
      'a URL with a query',
      'https://api.boardroom.example?a=1',
      CONTAINER_ERROR_CODE.InvalidApiBaseUrl,
    ],
    [
      'a URL with credentials',
      'https://me:secret@api.boardroom.example',
      CONTAINER_ERROR_CODE.InvalidApiBaseUrl,
    ],
    ['another scheme', 'ftp://api.boardroom.example', CONTAINER_ERROR_CODE.InvalidApiBaseUrl],
  ])('refuses %s for the address of the API, with a code of its own', (_name, apiBaseUrl, code) => {
    expect(http({ apiBaseUrl })).toEqual({ ok: false, error: { code } });
  });

  it('refuses http for a host that is not this machine outside of a development build', () => {
    expect(http({ apiBaseUrl: 'http://api.boardroom.example' }, RELEASE)).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InsecureApiBaseUrl },
    });
  });

  it.each(['http://localhost:4000', 'http://10.0.2.2:4000', 'http://127.0.0.1:4000'])(
    'accepts %s outside of a development build: the traffic does not leave the machine',
    (apiBaseUrl) => {
      expect(http({ apiBaseUrl }, RELEASE).ok).toBe(true);
    },
  );

  it('accepts http for any host in a development build, where the API runs on a computer of the network', () => {
    expect(http({ apiBaseUrl: 'http://192.168.1.20:4000' }, DEVELOPMENT).ok).toBe(true);
  });

  it('takes the request timeout and the passcode fallback it is given', () => {
    expect(http({ requestTimeoutMillis: 5000, allowDevicePasscode: true })).toMatchObject({
      ok: true,
      value: { requestTimeout: aDuration(5000), allowDevicePasscode: true },
    });
  });

  it.each([
    ['below the minimum', MIN_HTTP_REQUEST_TIMEOUT - 1],
    ['above the maximum', MAX_HTTP_REQUEST_TIMEOUT + 1],
    ['not a whole number', 2500.5],
    ['negative', -5],
    ['not a number', '5000'],
    ['not finite', Number.POSITIVE_INFINITY],
    ['zero', 0],
  ])('refuses a request timeout that is %s', (_name, requestTimeoutMillis) => {
    expect(http({ requestTimeoutMillis })).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InvalidRequestTimeout },
    });
  });

  it.each([MIN_HTTP_REQUEST_TIMEOUT, MAX_HTTP_REQUEST_TIMEOUT])(
    'accepts the bounds of the request timeout: %s',
    (requestTimeoutMillis) => {
      expect(http({ requestTimeoutMillis }).ok).toBe(true);
    },
  );

  it.each(['yes', 1, null])(
    'refuses %j for the passcode fallback, which is a yes or a no',
    (value) => {
      expect(http({ allowDevicePasscode: value })).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.InvalidBiometricFallback },
      });
    },
  );

  it('checks the address before the other settings', () => {
    expect(
      http({ apiBaseUrl: undefined, requestTimeoutMillis: 1, allowDevicePasscode: 'x' }),
    ).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.MissingApiBaseUrl },
    });
  });
});
