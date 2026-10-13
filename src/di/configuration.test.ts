import { CONTAINER_ERROR_CODE } from './errors';
import { ADAPTERS } from './adapters';
import { MOCK_STARTS_SIGNED_IN, SIMULATED_LATENCY } from './config';
import { defaultMockConfiguration, parseAdaptersSetting } from './configuration';

describe('defaultMockConfiguration', () => {
  it('is the mock configuration with the values of the configuration module', () => {
    expect(defaultMockConfiguration()).toEqual({
      kind: ADAPTERS.Mock,
      startSignedIn: MOCK_STARTS_SIGNED_IN,
      latency: SIMULATED_LATENCY,
    });
  });
});

describe('parseAdaptersSetting', () => {
  it.each([
    ['nothing is set', undefined],
    ['the variable is empty', ''],
    ['the variable is blank', '   '],
  ])('defaults to the mock configuration when %s', (_name, raw) => {
    expect(parseAdaptersSetting(raw)).toEqual({ ok: true, value: defaultMockConfiguration() });
  });

  it.each(['mock', 'MOCK', '  Mock \n'])('reads %j as the mock configuration', (raw) => {
    expect(parseAdaptersSetting(raw)).toEqual({ ok: true, value: defaultMockConfiguration() });
  });

  it.each(['http', 'HTTP', ' http '])('reads %j as the http configuration', (raw) => {
    expect(parseAdaptersSetting(raw)).toEqual({ ok: true, value: { kind: ADAPTERS.Http } });
  });

  it.each(['moc', 'mock,http', 'real', '0', 'null'])(
    'refuses %j instead of falling back to the mock configuration',
    (raw) => {
      expect(parseAdaptersSetting(raw)).toEqual({
        ok: false,
        error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: raw },
      });
    },
  );

  it('reports what it found, trimmed', () => {
    expect(parseAdaptersSetting('  staging ')).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: 'staging' },
    });
  });
});
