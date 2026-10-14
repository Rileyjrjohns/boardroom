import type { Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import {
  borderWidths,
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
  touchTarget,
} from '../theme/tokens';

import { LiveText } from './LiveText';

type InputBehaviour = Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoComplete'
  | 'autoCorrect'
  | 'inputMode'
  | 'keyboardType'
  | 'onSubmitEditing'
  | 'returnKeyType'
  | 'secureTextEntry'
  | 'spellCheck'
  | 'submitBehavior'
  | 'textContentType'
>;

interface TextFieldProps extends InputBehaviour {
  /** The translated name of the field, shown above it and read by the screen reader with it. */
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** The translated reason the value is refused, shown under the field and announced. */
  readonly error?: string;
  /** False while the form is being sent: the field keeps its value and cannot be edited. */
  readonly editable?: boolean;
  readonly inputRef?: Ref<TextInput>;
  readonly testID?: string;
  readonly errorTestID?: string;
}

/**
 * A text input with a visible label, an error under it, and the hints that keyboards and
 * password managers need (the caller sets the kind of keyboard, the capitalisation, the autofill
 * hint and, for a password, the secure entry). The label is also the accessibility label, so that
 * the field is announced with its name, and the error is a live region, so that it is announced
 * when it appears.
 */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  editable = true,
  inputRef,
  testID,
  errorTestID,
  ...behaviour
}: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={editable}
        onChangeText={onChangeText}
        style={[styles.input, error !== undefined && styles.invalid, !editable && styles.readOnly]}
        value={value}
        {...(inputRef === undefined ? {} : { ref: inputRef })}
        {...(testID === undefined ? {} : { testID })}
        {...behaviour}
      />
      {error === undefined ? null : (
        <LiveText
          message={error}
          style={styles.error}
          {...(errorTestID === undefined ? {} : { testID: errorTestID })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  input: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: borderWidths.hairline,
    borderColor: colors.border,
    backgroundColor: colors.background,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  invalid: {
    borderColor: colors.danger,
  },
  readOnly: {
    backgroundColor: colors.surface,
  },
  error: {
    fontSize: fontSizes.caption,
    color: colors.danger,
  },
});
