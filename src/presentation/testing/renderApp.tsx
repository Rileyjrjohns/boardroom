import { renderRouter } from 'expo-router/testing-library';

import { AppNavigator } from '../navigation/AppNavigator';
import { ACCESS } from '../state/uiStore';
import { SessionController } from '../session/SessionController';

import { createHarness } from './renderScreen';
import type { RenderScreenOptions } from './renderScreen';

// Test support, not production code: only tests import it (a lint rule enforces it).

/**
 * The route files of the app, relative to the directory the tests run from (the root of the
 * repository): the real ones, so that a route that stops working fails a test.
 */
const APP_DIR = 'app';

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
    { appDir: APP_DIR, overrides: { _layout: Layout } },
    initialUrl === undefined ? {} : { initialUrl },
  );
  return { ...rendered, ...harness };
}
