import { startContainer } from '@di/createContainer';
import { AppStatusBar } from '@presentation/components/AppStatusBar';
import { I18nProvider } from '@presentation/i18n/I18nProvider';
import { AppNavigator } from '@presentation/navigation/AppNavigator';
import { StartupGate } from '@presentation/services/StartupGate';
import type { StartApp } from '@presentation/services/StartupGate';

// The screen shown when a screen fails while it renders. expo-router looks for this export.
export { AppErrorBoundary as ErrorBoundary } from '@presentation/navigation/AppErrorBoundary';

/**
 * Starts the demo with the demo user signed in, because the screens that sign in arrive with the
 * next step: until then the app would open on a list that says "signed out" with nothing to do
 * about it. The mock configuration is otherwise signed out, like the real one. Remove this line
 * when the sign-in screen is mounted (owner: the UI half of step 4).
 */
const MOCK_STARTS_SIGNED_IN_UNTIL_THE_SIGN_IN_SCREEN = true;

/**
 * The one place that reads the environment. Metro replaces these exact expressions with their
 * values at build time, so they cannot be moved behind a variable name, and `EXPO_PUBLIC_` is what
 * makes Expo expose a variable to the app. The values go raw to the composition root, which
 * validates them and is told whether this is a development build: only there is a missing adapters
 * setting the mock one.
 */
const startApp: StartApp = (biometricPromptText) =>
  startContainer(
    {
      adapters: process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS,
      apiBaseUrl: process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL,
      mockStartsSignedIn: MOCK_STARTS_SIGNED_IN_UNTIL_THE_SIGN_IN_SCREEN,
    },
    { development: __DEV__ },
    { biometricPromptText },
  );

// Root layout. It starts the composition root once (the gate shows a translated loading state, then
// the screens, or the reason the app cannot start) and hands it to the providers of the
// presentation layer, which is the only link between the two: the layer never imports `@di`. The
// `app/` folder stays free of business logic.
export default function RootLayout() {
  return (
    <>
      <AppStatusBar />
      <I18nProvider>
        <StartupGate start={startApp}>
          <AppNavigator />
        </StartupGate>
      </I18nProvider>
    </>
  );
}
