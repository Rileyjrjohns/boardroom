import fs from 'node:fs';
import path from 'node:path';

import { ROUTES, ROUTE_NAMES, ROUTE_PARAMS } from '../src/presentation/navigation/routes';

// The routes are files under app/, and the code refers to them by constants. A constant that points
// at a file that does not exist would navigate nowhere, and nothing else would notice.

const APP = path.resolve(__dirname, '..', 'app');
const FILE_EXTENSION = '.tsx';

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
    const known = [...Object.values(ROUTE_NAMES), '_layout'].sort();

    expect(files).toEqual(known);
  });
});
