import { Pressable, StyleSheet, Text } from 'react-native';

import {
  borderWidths,
  colors,
  fontSizes,
  fontWeights,
  pressedOpacity,
  radii,
  spacing,
  touchTarget,
} from '../theme/tokens';

interface ButtonProps {
  /** The translated text of the button. */
  readonly title: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** A button with a visible text. At least as big as the touch target the platforms ask for. */
export function Button({ title, onPress, testID }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      {...(testID === undefined ? {} : { testID })}
    >
      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: borderWidths.hairline,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: pressedOpacity,
  },
  title: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.onPrimary,
  },
});
