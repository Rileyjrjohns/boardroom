import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Modal, StyleSheet, Text, View } from 'react-native';

import { useUiStore } from '@composition/shell/state/uiStore';

import {
  colors,
  dimmedOpacity,
  fontSizes,
  fontWeights,
  maxContentWidth,
  radii,
  spacing,
} from '../theme/tokens';

import { useDialogHost } from './DialogHost';
import { PrivacyCover } from './PrivacyCover';

interface DialogProps {
  readonly visible: boolean;
  /** The translated title, announced as a header: it is where the screen reader's focus goes. */
  readonly title: string;
  /** Asked for by the system's back gesture or button. Nothing else dismisses the dialog. */
  readonly onDismiss: () => void;
  /** The body: text, mostly. */
  readonly children: ReactNode;
  /** The buttons, in the order they are read. The safe one goes first. */
  readonly actions: ReactNode;
  readonly testID?: string;
}

/**
 * A window over the screen that asks something of the user: a confirmation, mostly. It is React
 * Native's `Modal`, which is a window of the platform of its own and so traps the screen reader:
 * on iOS the content below is out of reach of VoiceOver and the view is flagged as modal, on
 * Android it is a dialog window that TalkBack stays in. When it opens, the focus of the screen
 * reader goes to its title, and the back button or gesture dismisses it (`onDismiss`).
 *
 * A window of its own is not under the cover of the root (see `PrivacyCover`), so the dialog shows
 * the cover itself while the app is inactive or in the background: what it asks is often
 * confidential (the choice of a vote), and the snapshot of the app switcher includes it.
 *
 * While it is open, the screen under it is hidden from the screen reader on Android too. It is the
 * host's job (see `DialogHost`), and the reason the dialog hands its window over to it instead of
 * drawing it where it is written: written inside the screen, it would be hidden with it.
 */
export function Dialog({ visible, title, onDismiss, children, actions, testID }: DialogProps) {
  const covered = useUiStore((state) => state.privacyCover);
  const titleRef = useRef<Text>(null);
  const host = useDialogHost();
  const id = useId();

  useEffect(() => {
    if (visible && !covered && titleRef.current !== null) {
      AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
    }
  }, [visible, covered]);

  const window = (
    <Modal
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      {covered ? (
        <PrivacyCover />
      ) : (
        <View style={styles.backdrop}>
          {/* The dimming is a layer of its own: an opacity on the backdrop would fade the card too. */}
          <View style={[StyleSheet.absoluteFill, styles.dimmed]} />
          <View
            accessibilityViewIsModal
            style={styles.card}
            {...(testID === undefined ? {} : { testID })}
          >
            <Text accessibilityRole="header" ref={titleRef} style={styles.title}>
              {title}
            </Text>
            {children}
            <View style={styles.actions}>{actions}</View>
          </View>
        </View>
      )}
    </Modal>
  );

  // The window is handed to the host on every render: what it holds (a failure, a busy button)
  // changes with the state of the screen that wrote it. It stays in the host, closed, until the
  // dialog is gone, so that closing it can fade out.
  useLayoutEffect(() => {
    host?.show(id, { window, visible });
  });
  useLayoutEffect(() => {
    return () => {
      host?.hide(id);
    };
  }, [host, id]);

  return host === undefined ? window : null;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dimmed: {
    backgroundColor: colors.textPrimary,
    opacity: dimmedOpacity,
  },
  card: {
    width: '100%',
    maxWidth: maxContentWidth.dialog,
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSizes.subtitle,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});
