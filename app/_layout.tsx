import { startContainer } from '@composition/container/createContainer';
import { AppNavigator } from '@composition/shell/navigation/AppNavigator';
import { StartupGate } from '@composition/shell/services/StartupGate';
import type { StartApp } from '@composition/shell/services/StartupGate';
import { SessionController } from '@composition/shell/session/SessionController';
import { AppStatusBar } from '@core/presentation/components/AppStatusBar';
import { I18nProvider } from '@core/presentation/i18n/I18nProvider';

// The screen shown when a screen fails while it renders. expo-router looks for this export.
export { AppErrorBoundary as ErrorBoundary } from '@composition/shell/navigation/AppErrorBoundary';

/**
 * The one place that reads the environment. Metro replaces these exact expressions with their
 * values at build time, so they cannot be moved behind a variable name, and `EXPO_PUBLIC_` is what
 * makes Expo expose a variable to the app. The values go raw to the composition root, which
 * validates them and is told whether this is a development build: only there is a missing adapters
 * setting the mock one. The Sentry address is optional: without it, the monitoring is the console.
 */
const startApp: StartApp = (biometricPromptText) =>
  startContainer(
    {
      adapters: process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS,
      apiBaseUrl: process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    },
    { development: __DEV__ },
    { biometricPromptText },
  );

// Root layout. It starts the composition root once (the gate shows a translated loading state, then
// the screens, or the reason the app cannot start) and hands it to the providers of the
// presentation layer, which is the only link between the two: the layer never imports the container
// (`@composition/container`). The session controller follows who is signed in and the life of the
// app, and the navigator shows the screens the user can reach. The `app/` folder stays free of
// business logic.
export default function RootLayout() {
  return (
    <>
      <AppStatusBar />
      <I18nProvider>
        <StartupGate start={startApp}>
          <SessionController>
            <AppNavigator />
          </SessionController>
        </StartupGate>
      </I18nProvider>
    </>
  );
}
