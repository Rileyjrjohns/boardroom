import { Pressable, StyleSheet, Text, View } from 'react-native';

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

export interface SegmentedOption<Value extends string> {
  readonly value: Value;
  /** The translated text of the segment. */
  readonly label: string;
  readonly testID?: string;
}

interface SegmentedControlProps<Value extends string> {
  readonly options: readonly SegmentedOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  /** The translated name of what the control chooses, read by the screen reader with the group. */
  readonly accessibilityLabel: string;
}

/**
 * Chooses one of a few values. It is a list of tabs: the group is a `tablist`, each segment a `tab`
 * that says whether it is selected, and each one is at least as big as the touch target the
 * platforms ask for.
 */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<Value>) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.group}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.selectedSegment,
              pressed && styles.pressed,
            ]}
            {...(option.testID === undefined ? {} : { testID: option.testID })}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    margin: spacing.lg,
    padding: spacing.xs,
    borderRadius: radii.md,
    borderWidth: borderWidths.hairline,
    borderColor: colors.interactiveBorder,
    backgroundColor: colors.surface,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  selectedSegment: {
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: pressedOpacity,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  selectedLabel: {
    color: colors.onPrimary,
  },
});
