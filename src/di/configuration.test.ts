import { CONTAINER_ERROR_CODE } from './errors';
import { ADAPTERS } from './adapters';
import { MOCK_SESSION_LIFETIME, MOCK_STARTS_SIGNED_IN, SIMULATED_LATENCY } from './config';
import { defaultMockConfiguration, parseAdaptersSetting } from './configuration';

describe('defaultMockConfiguration', () => {
  it('is the mock configuration with the values of the configuration module', () => {
    expect(defaultMockConfiguration()).toEqual({
      kind: ADAPTERS.Mock,
      startSignedIn: MOCK_STARTS_SIGNED_IN,
      latency: SIMULATED_LATENCY,
      sessionLifetime: MOCK_SESSION_LIFETIME,
    });
  });
});

const DEVELOPMENT = { development: true };
const RELEASE = { development: false };

describe('parseAdaptersSetting', () => {
  it.each([
    ['nothing is set', undefined],
    ['the variable is empty', ''],
    ['the variable is blank', '   '],
  ])('defaults to the mock configuration in a development build when %s', (_name, raw) => {
    expect(parseAdaptersSetting(raw, DEVELOPMENT)).toEqual({
      ok: true,
      value: defaultMockConfiguration(),
    });
  });

  it.each(['mock', 'MOCK', '  Mock \n'])('reads %j as the mock configuration', (raw) => {
    expect(parseAdaptersSetting(raw, DEVELOPMENT)).toEqual({
      ok: true,
      value: defaultMockConfiguration(),
    });
  });

  it.each(['http', 'HTTP', ' http '])('reads %j as the http configuration', (raw) => {
    expect(parseAdaptersSetting(raw, DEVELOPMENT)).toEqual({
      ok: true,
      value: { kind: ADAPTERS.Http },
    });
  });

  it.each(['moc', 'mock,http', 'real', '0', 'null'])(
    'refuses %j instead of falling back to the mock configuration',
    (raw) => {
      expect(parseAdaptersSetting(raw, DEVELOPMENT)).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: raw },
      });
    },
  );

  it('reports what it found, trimmed', () => {
    expect(parseAdaptersSetting('  staging ', DEVELOPMENT)).toEqual({
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
      expect(parseAdaptersSetting(raw, RELEASE)).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.MissingAdaptersSetting },
      });
    });

    it('accepts the settings it knows, like a development build does', () => {
      expect(parseAdaptersSetting('mock', RELEASE)).toEqual({
        ok: true,
        value: defaultMockConfiguration(),
      });
      expect(parseAdaptersSetting('http', RELEASE)).toEqual({
        ok: true,
        value: { kind: ADAPTERS.Http },
      });
    });

    it('refuses a setting it does not know, like a development build does', () => {
      expect(parseAdaptersSetting('staging', RELEASE)).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: 'staging' },
      });
    });
  });
});
