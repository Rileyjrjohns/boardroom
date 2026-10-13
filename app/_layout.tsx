import { useState } from 'react';

import { startContainer } from '@di/createContainer';
import { AppStatusBar } from '@presentation/components/AppStatusBar';
import { I18nProvider } from '@presentation/i18n/I18nProvider';
import { AppNavigator } from '@presentation/navigation/AppNavigator';
import { StartupFailureScreen } from '@presentation/screens/StartupFailureScreen';
import { AppProviders } from '@presentation/services/AppProviders';

// The screen shown when a screen fails while it renders. expo-router looks for this export.
export { AppErrorBoundary as ErrorBoundary } from '@presentation/navigation/AppErrorBoundary';

// Root layout. It builds the composition root once and hands it to the providers of the
// presentation layer, which is the only link between the two: the layer never imports `@di`. The
// `app/` folder stays free of business logic.
export default function RootLayout() {
  // The one place that reads the environment. Metro replaces this exact expression with the value
  // at build time, so it cannot be moved behind a variable name, and `EXPO_PUBLIC_` is what makes
  // Expo expose the variable to the app. It is parsed and validated by the composition root, which
  // is also told whether this is a development build: only there is a missing value the mock one.
  const [started] = useState(() =>
    startContainer(process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS, { development: __DEV__ }),
  );

  return (
    <>
      <AppStatusBar />
      <I18nProvider>
        {started.ok ? (
          <AppProviders services={started.value}>
            <AppNavigator />
          </AppProviders>
        ) : (
          <StartupFailureScreen code={started.error.code} />
        )}
      </I18nProvider>
    </>
  );
}
