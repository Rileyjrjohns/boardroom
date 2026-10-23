import fs from 'node:fs';
import path from 'node:path';

import { redirectSystemPath } from '../app/+native-intent';
import { ROUTES, ROUTE_NAMES, ROUTE_PARAMS } from '../src/core/presentation/navigation/routes';

// The routes are files under app/, and the code refers to them by constants. A constant that points
// at a file that does not exist would navigate nowhere, and nothing else would notice.

const APP = path.resolve(__dirname, '..', 'app');
const FILE_EXTENSION = '.tsx';
/** The file the router asks what to do with the links the system hands it: no screen of its own. */
const NATIVE_INTENT = '+native-intent';
/** The root layout: the scenario tests replace it with their own. */
const LAYOUT = '_layout';
/** The route files the scenario tests mount (see `renderApp`): one per route, each a re-export. */
const TEST_ROUTES = path.resolve(__dirname, 'app-routes');
const TEST_ROUTE_EXTENSION = '.ts';

/** The file of a route: `/` is `index`, `/meetings/[meetingId]` is `meetings/[meetingId]`. */
function fileOf(route: string): string {
  const name = route === '/' ? 'index' : route.replace(/^\//, '');
  return path.join(APP, `${name}${FILE_EXTENSION}`);
}

describe('the routes', () => {
  it.each(Object.entries(ROUTES))('has a file under app/ for the route %s (%s)', (_name, route) => {
    expect(fs.existsSync(fileOf(route))).toBe(true);
  });

  it('names each route in the stack after its file', () => {
    expect(ROUTE_NAMES.meetings).toBe('index');
    expect(fileOf(ROUTES.meetings)).toBe(
      path.join(APP, `${ROUTE_NAMES.meetings}${FILE_EXTENSION}`),
    );
    expect(fileOf(ROUTES.meetingDetail)).toBe(
      path.join(APP, `${ROUTE_NAMES.meetingDetail}${FILE_EXTENSION}`),
    );
  });

  it('names the screens of the session after their files', () => {
    expect(fileOf(ROUTES.signIn)).toBe(path.join(APP, `${ROUTE_NAMES.signIn}${FILE_EXTENSION}`));
    expect(fileOf(ROUTES.lock)).toBe(path.join(APP, `${ROUTE_NAMES.lock}${FILE_EXTENSION}`));
    expect(fileOf(ROUTES.pendingVotes)).toBe(
      path.join(APP, `${ROUTE_NAMES.pendingVotes}${FILE_EXTENSION}`),
    );
  });

  it('names each parameter after the bracketed segment of its route', () => {
    expect(ROUTES.meetingDetail).toContain(`[${ROUTE_PARAMS.meetingId}]`);
  });

  it('has no route file that no constant knows about', () => {
    const files = fs
      .readdirSync(APP, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith(FILE_EXTENSION))
      .map((file) => file.slice(0, -FILE_EXTENSION.length))
      .sort();
    const known = [...Object.values(ROUTE_NAMES), '_layout', NATIVE_INTENT].sort();

    expect(files).toEqual(known);
  });
});

describe('the file that rewrites the links the system hands the router', () => {
  /** How the development launcher of a dev build opens the app (see `systemLinks.ts`). */
  const LAUNCHER_LINK = 'boardroom://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081';

  it('is the redirect of the presentation layer: the launcher link is dropped, a link to a screen is not', () => {
    expect(redirectSystemPath({ path: LAUNCHER_LINK, initial: true })).toBeUndefined();
    expect(redirectSystemPath({ path: ROUTES.pendingVotes, initial: false })).toBe(
      ROUTES.pendingVotes,
    );
  });
});

describe('the route files the scenario tests mount', () => {
  const routeFilesOf = (directory: string, extension: string): string[] =>
    fs
      .readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith(extension))
      .map((file) => file.slice(0, -extension.length))
      .filter((file) => file !== LAYOUT && file !== NATIVE_INTENT)
      .sort();

  it('are one per route of app/, no more and no fewer', () => {
    expect(routeFilesOf(TEST_ROUTES, TEST_ROUTE_EXTENSION)).toEqual(
      routeFilesOf(APP, FILE_EXTENSION),
    );
  });

  it.each(routeFilesOf(APP, FILE_EXTENSION))(
    'mount the real route %s: the file re-exports its component, and nothing else',
    (route) => {
      const mirror = path.join(TEST_ROUTES, `${route}${TEST_ROUTE_EXTENSION}`);
      const real = path.relative(path.dirname(mirror), path.join(APP, route));

      expect(fs.readFileSync(mirror, 'utf8')).toBe(`export { default } from '${real}';\n`);
    },
  );
});
