import { API_BASE_URL_ERROR, LOCAL_HOSTS, parseApiBaseUrl } from './apiBaseUrl';

const DEVELOPMENT = { development: true };
const RELEASE = { development: false };

describe('parseApiBaseUrl', () => {
  it.each([
    ['https://api.boardroom.example', 'https://api.boardroom.example'],
    ['https://api.boardroom.example/', 'https://api.boardroom.example'],
    ['https://api.boardroom.example///', 'https://api.boardroom.example'],
    ['  https://api.boardroom.example/v1/  ', 'https://api.boardroom.example/v1'],
    ['HTTPS://API.Boardroom.EXAMPLE/V1', 'https://api.boardroom.example/V1'],
    ['https://api.boardroom.example:8443/api/v2', 'https://api.boardroom.example:8443/api/v2'],
    ['https://203.0.113.7', 'https://203.0.113.7'],
    ['https://[2001:db8::1]:8443', 'https://[2001:db8::1]:8443'],
    ['https://a', 'https://a'],
    ['https://api.boardroom.example:1', 'https://api.boardroom.example:1'],
    ['https://api.boardroom.example:65535', 'https://api.boardroom.example:65535'],
  ])('reads %j as %s', (raw, expected) => {
    expect(parseApiBaseUrl(raw, RELEASE)).toEqual({ ok: true, value: expected });
  });

  it.each([undefined, '', '   ', '\n'])('says it is missing when it is %j', (raw) => {
    expect(parseApiBaseUrl(raw, DEVELOPMENT)).toEqual({
      ok: false,
      error: API_BASE_URL_ERROR.Missing,
    });
  });

  it.each([
    'api.boardroom.example',
    '//api.boardroom.example',
    'ftp://api.boardroom.example',
    'https://',
    'https:///path',
    'https://api.boardroom.example?token=1',
    'https://api.boardroom.example/path?x=1',
    'https://api.boardroom.example#top',
    'https://user:password@api.boardroom.example',
    'https://user@api.boardroom.example',
    'https://api.boardroom.example:0',
    'https://api.boardroom.example:65536',
    'https://api.boardroom.example:port',
    'https://api boardroom.example',
    'https://api.boardroom.example/a b',
    'https://-bad.example',
    'https://bad-.example',
    'javascript:alert(1)',
  ])('refuses %j as malformed', (raw) => {
    expect(parseApiBaseUrl(raw, DEVELOPMENT)).toEqual({
      ok: false,
      error: API_BASE_URL_ERROR.Malformed,
    });
  });

  describe('the scheme', () => {
    it('refuses http for a host that is not this machine outside of a development build', () => {
      expect(parseApiBaseUrl('http://api.boardroom.example', RELEASE)).toEqual({
        ok: false,
        error: API_BASE_URL_ERROR.Insecure,
      });
      expect(parseApiBaseUrl('HTTP://192.168.1.20:4000', RELEASE)).toEqual({
        ok: false,
        error: API_BASE_URL_ERROR.Insecure,
      });
    });

    it.each(LOCAL_HOSTS)(
      'accepts http for %s in any build: the traffic stays on the machine',
      (host) => {
        expect(parseApiBaseUrl(`http://${host}:4000`, RELEASE)).toEqual({
          ok: true,
          value: `http://${host}:4000`,
        });
      },
    );

    it('does not take a host that merely starts with a local name for a local one', () => {
      expect(parseApiBaseUrl('http://localhost.evil.example', RELEASE)).toEqual({
        ok: false,
        error: API_BASE_URL_ERROR.Insecure,
      });
      expect(parseApiBaseUrl('http://127.0.0.1.evil.example', RELEASE)).toEqual({
        ok: false,
        error: API_BASE_URL_ERROR.Insecure,
      });
    });

    it('accepts http for any host in a development build', () => {
      expect(parseApiBaseUrl('http://192.168.1.20:4000', DEVELOPMENT)).toEqual({
        ok: true,
        value: 'http://192.168.1.20:4000',
      });
    });

    it('always accepts https', () => {
      expect(parseApiBaseUrl('https://localhost:4000', RELEASE).ok).toBe(true);
      expect(parseApiBaseUrl('https://api.boardroom.example', DEVELOPMENT).ok).toBe(true);
    });
  });
});
