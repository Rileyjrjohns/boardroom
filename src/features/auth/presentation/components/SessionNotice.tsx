import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { LiveText } from '@core/presentation/components/LiveText';
import { colors, fontSizes } from '@core/presentation/theme/tokens';
import type { SessionEndingCode } from '@features/auth/application/session/sessionPolicy';

import { SESSION_ENDED_KEYS } from '../i18n/authMessageKeys';
import { AUTH_TEST_IDS } from '../testIds';

interface SessionNoticeProps {
  /** The failure that sent the user back to this screen. */
  readonly code: SessionEndingCode;
}

/**
 * Why the user is on the sign-in or the lock screen when they did not ask to be: their session
 * expired, the server refused it, another user signed in, the app locked. It is announced when it
 * appears, and it is the same text as when the failure is met anywhere else.
 */
export function SessionNotice({ code }: SessionNoticeProps) {
  const { t } = useTranslation();

  return (
    <LiveText
      message={t(SESSION_ENDED_KEYS[code])}
      style={styles.notice}
      testID={AUTH_TEST_IDS.sessionNotice}
    />
  );
}

const styles = StyleSheet.create({
  notice: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
