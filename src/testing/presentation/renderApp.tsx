import { renderRouter } from 'expo-router/testing-library';

import { AppNavigator } from '@composition/shell/navigation/AppNavigator';
import { SessionController } from '@composition/shell/session/SessionController';
import { ACCESS } from '@composition/shell/state/uiStore';

import { createHarness } from './renderScreen';
import type { RenderScreenOptions } from './renderScreen';

// Test support, not production code: only tests import it (a lint rule enforces it).

/**
 * The route files the scenario tests mount, relative to the directory the tests run from (the root
 * of the repository): one file per route of `app/`, each re-exporting the real one, so that a route
 * that stops working fails a test. They are listed apart from `app/` because the router's loader of
 * a directory, in tests, does not leave out the file that rewrites the links the system hands the
 * router (`app/+native-intent.tsx`: not a route, the router skips it by its path, which the loader
 * does not keep). `tooling/routes.test.ts` checks that the two directories list the same routes.
 */
const ROUTES_DIR = 'tooling/app-routes';

/** The root layout, which the tests replace with their own. */
const LAYOUT = '_layout';

export interface RenderAppOptions extends RenderScreenOptions {
  /** The link the app is opened with. Without one it opens on its first route. */
  readonly initialUrl?: string;
}

/**
 * Renders the navigator of the app on the real route files (`app/`), the way expo-router does on a
 * device, with the real session controller and the real use cases over the fakes of the ports. Only
 * the root layout is replaced: the real one builds the composition root, this one builds the
 * providers of the tests (the same `AppProviders`, query client, store and translations as
 * `renderScreen`). The app starts where a cold start does, before `RestoreSession` has answered,
 * unless the test says otherwise. Like `renderRouter`, it switches to fake timers.
 */
export function renderApp(options: RenderAppOptions = {}) {
  const { initialUrl, ...screenOptions } = options;
  const { Providers, ...harness } = createHarness({ access: ACCESS.Starting, ...screenOptions });

  function Layout() {
    return (
      <Providers>
        <SessionController>
          <AppNavigator />
        </SessionController>
      </Providers>
    );
  }

  const rendered = renderRouter(
    { appDir: ROUTES_DIR, overrides: { [LAYOUT]: Layout } },
    initialUrl === undefined ? {} : { initialUrl },
  );
  return { ...rendered, ...harness };
}
