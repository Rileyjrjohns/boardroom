import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState } from '../components/ErrorState';
import type { MeetingsErrorCode } from '../i18n/translationKeys';
import { TEST_IDS } from '../testIds';
import { colors } from '../theme/tokens';

interface SessionEndedScreenProps {
  /** The failure that ended the session. */
  readonly code: MeetingsErrorCode;
}

/**
 * What the app shows once the session is over (the server refused it, it expired, another user is
 * signed in, the app is locked). It replaces the screens, so that none of them shows, or asks
 * again for, the data of a session that no longer exists. There is nothing to retry: step 4 puts
 * the sign-in and the unlock screens in its place.
 */
export function SessionEndedScreen({ code }: SessionEndedScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ErrorState code={code} testID={TEST_IDS.sessionEnded} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
