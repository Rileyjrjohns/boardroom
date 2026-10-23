import { MAX_SYSTEM_LINK_LENGTH, redirectSystemPath } from './systemLinks';

const LAUNCHER_LINKS = [
  'exp+boardroom://expo-development-client/?url=http%3A%2F%2F192.168.1.156%3A8081',
  'boardroom://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081',
  'exp+boardroom://expo-development-client',
  'exp+boardroom://expo-development-client/',
  'EXP+BOARDROOM://EXPO-DEVELOPMENT-CLIENT/?url=x',
  'exp+boardroom://expo-development-client#start',
];

const LINKS_TO_SCREENS = [
  '/',
  '/sign-in',
  '/meetings/meeting-1',
  '/pending-votes?from=header',
  'boardroom://meetings/meeting-1',
  'boardroom:///pending-votes',
  'https://boardroom.example/meetings/meeting-1',
  // Looks like the launcher's host, and is not: a screen of the app may carry any name.
  'boardroom://expo-development-client-notes/1',
  'boardroom://meetings/expo-development-client',
];

// Percent-encoding that cannot be decoded: a lone `%`, a `%` and one digit, a digit that is not
// hexadecimal, bytes that are no UTF-8. The query-string parser of the router decodes such a link
// very slowly (the time grows with the square of its length), so it must never reach it.
const MALFORMED_LINKS = [
  'boardroom://meetings/%',
  '/meetings/%E0%A4%A',
  '/pending-votes?from=%zz',
  '/pending-votes?from=%',
  'boardroom://meetings/%ED%A0%80',
  `boardroom://meetings/1?a=${'%A'.repeat(500)}`,
  `/pending-votes?from=${'%E0%A4'.repeat(200)}%`,
];

const WELL_FORMED_ENCODED_LINKS = [
  '/meetings/meeting%201',
  '/pending-votes?from=%C3%A9t%C3%A9',
  'boardroom://meetings/meeting-1?title=Board%20%26%20Audit',
  '/pending-votes?from=100%25',
];

describe('redirectSystemPath', () => {
  it.each(LAUNCHER_LINKS)(
    'drops the link of the development launcher, started or not: %s',
    (path) => {
      expect(redirectSystemPath({ path, initial: true })).toBeUndefined();
      expect(redirectSystemPath({ path, initial: false })).toBeUndefined();
    },
  );

  it.each(LINKS_TO_SCREENS)('hands a link to a screen to the router as it is: %s', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe(path);
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });

  it.each(MALFORMED_LINKS)('drops a link whose percent-encoding is malformed: %s', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBeUndefined();
    expect(redirectSystemPath({ path, initial: false })).toBeUndefined();
  });

  it.each(WELL_FORMED_ENCODED_LINKS)(
    'hands a link with well-formed percent-encoding to the router as it is: %s',
    (path) => {
      expect(redirectSystemPath({ path, initial: true })).toBe(path);
      expect(redirectSystemPath({ path, initial: false })).toBe(path);
    },
  );

  describe('the length of a link', () => {
    const LONG_PREFIX = '/pending-votes?from=';
    const ofLength = (length: number): string =>
      LONG_PREFIX + 'a'.repeat(length - LONG_PREFIX.length);

    it('is accepted up to the maximum, included', () => {
      const path = ofLength(MAX_SYSTEM_LINK_LENGTH);

      expect(path).toHaveLength(MAX_SYSTEM_LINK_LENGTH);
      expect(redirectSystemPath({ path, initial: false })).toBe(path);
    });

    it('is refused above the maximum, whatever the link says', () => {
      const path = ofLength(MAX_SYSTEM_LINK_LENGTH + 1);

      expect(redirectSystemPath({ path, initial: true })).toBeUndefined();
      expect(redirectSystemPath({ path, initial: false })).toBeUndefined();
    });

    it('is refused for a link that is well formed, too', () => {
      const path = `/pending-votes?from=${'%C3%A9'.repeat(MAX_SYSTEM_LINK_LENGTH)}`;

      expect(redirectSystemPath({ path, initial: false })).toBeUndefined();
    });

    it('is a maximum that no link to a screen of the app comes near', () => {
      expect(MAX_SYSTEM_LINK_LENGTH).toBeGreaterThanOrEqual(1024);
      expect(MAX_SYSTEM_LINK_LENGTH).toBeLessThanOrEqual(4096);
    });
  });
});
