import type { ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';

import { ErrorState } from '../components/ErrorState';
import { I18nProvider } from '../i18n/I18nProvider';
import { TEST_IDS } from '../testIds';
import { colors } from '../theme/tokens';

/**
 * What the app shows when a screen fails while it renders, instead of a blank screen: the message
 * for an unexpected error, in the language of the device, and a button to try again (expo-router
 * renders the screen again). It is exported from the root layout as `ErrorBoundary`, which is how
 * expo-router looks for it, and the route file only re-exports it.
 *
 * It replaces the layout, so it sits above the providers of the layout: it brings the translations
 * itself, and nothing else. The error is not shown to the user, and is not read here either: the
 * development tools of React Native already report it.
 */
export function AppErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <I18nProvider>
      <View style={styles.screen} testID={TEST_IDS.errorBoundary}>
        <ErrorState
          code={REPOSITORY_ERROR_CODE.Unexpected}
          onRetry={() => {
            void retry();
          }}
        />
      </View>
    </I18nProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
