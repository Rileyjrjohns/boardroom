import { redirectSystemPath } from './systemLinks';

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
});
