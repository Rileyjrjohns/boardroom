import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useAnnounce } from '../accessibility/useAnnounce';
import {
  borderWidths,
  colors,
  disabledOpacity,
  fontSizes,
  fontWeights,
  pressedOpacity,
  radii,
  spacing,
  touchTarget,
} from '../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  /** The translated text of the button. */
  readonly title: string;
  readonly onPress: () => void;
  /** The main action of a screen, a quiet one, or one that cannot be undone. */
  readonly variant?: ButtonVariant;
  /** Cannot be used now, and says so to the screen reader. */
  readonly disabled?: boolean;
  /**
   * Its action is under way: it shows a spinner, cannot be pressed again and says it is busy. The
   * title should then say what is going on (`Signing in`): it is announced on iOS.
   */
  readonly busy?: boolean;
  /** The translated sentence that says what the button leads to, when its title does not. */
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

/** A button with a visible text. At least as big as the touch target the platforms ask for. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const unavailable = disabled || busy;
  useAnnounce(busy ? title : undefined);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyles[variant].button,
        unavailable && styles.unavailable,
        pressed && styles.pressed,
      ]}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...(testID === undefined ? {} : { testID })}
    >
      {busy ? <ActivityIndicator color={variantStyles[variant].spinner} /> : null}
      <Text style={[styles.title, variantStyles[variant].title]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: borderWidths.hairline,
  },
  pressed: {
    opacity: pressedOpacity,
  },
  unavailable: {
    opacity: disabledOpacity,
  },
  title: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
  },
});

const variantStyles = {
  primary: {
    ...StyleSheet.create({
      button: { borderColor: colors.primary, backgroundColor: colors.primary },
      title: { color: colors.onPrimary },
    }),
    spinner: colors.onPrimary,
  },
  secondary: {
    ...StyleSheet.create({
      button: { borderColor: colors.primary, backgroundColor: colors.background },
      title: { color: colors.primary },
    }),
    spinner: colors.primary,
  },
  danger: {
    ...StyleSheet.create({
      button: { borderColor: colors.danger, backgroundColor: colors.danger },
      title: { color: colors.onPrimary },
    }),
    spinner: colors.onPrimary,
  },
} as const satisfies Record<ButtonVariant, unknown>;
