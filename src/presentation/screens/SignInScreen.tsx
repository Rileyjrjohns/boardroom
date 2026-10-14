import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VALIDATION_ERROR_CODE, VALIDATION_FIELD } from '@domain/errors/ValidationError';
import type { ValidationError } from '@domain/errors/ValidationError';
import { isErr } from '@domain/shared/Result';
import { createCredentials } from '@domain/value-objects/Credentials';

import { Button } from '../components/Button';
import { DemoAccounts } from '../components/DemoControls';
import { LiveText } from '../components/LiveText';
import { SessionNotice } from '../components/SessionNotice';
import { TextField } from '../components/TextField';
import { useSignIn } from '../hooks/useSignIn';
import { EMAIL_RULE_KEYS, PASSWORD_RULE_KEYS, SIGN_IN_ERROR_KEYS } from '../i18n/translationKeys';
import { useUiStore } from '../state/uiStore';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, fontWeights, maxContentWidth, spacing } from '../theme/tokens';

/**
 * The sign-in form. The credentials are checked here first, with the rules of the domain (a
 * well-formed email address, a password that is not empty), so that a mistake is told next to its
 * field without waiting for the server; the `SignIn` use case checks them again, and what comes
 * back from it is told the same way. The refusals that are not about a field (wrong credentials,
 * the server out of reach) are told above the button.
 *
 * The password is in the state of this screen only while it is being typed: pressing "sign in"
 * hands it over and empties the field, whatever the answer, so that it is not on the screen, or in
 * any state, a moment longer than needed. While the request is under way the button is busy and a
 * second press (or the "go" key of the keyboard) does nothing. In the mock configuration the
 * accounts of the simulated server are offered under the form.
 */
export function SignInScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const endedBy = useUiStore((state) => state.sessionEndedBy);
  const { signIn, isPending, failure } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [refused, setRefused] = useState<ValidationError>();
  const passwordInput = useRef<TextInput>(null);

  // The password was emptied when the form was sent: whoever failed starts typing it again.
  useEffect(() => {
    if (failure !== undefined) passwordInput.current?.focus();
  }, [failure]);

  const submit = () => {
    if (isPending) return;
    const checked = createCredentials(email, password);
    if (isErr(checked)) {
      setRefused(checked.error);
      return;
    }
    Keyboard.dismiss();
    setRefused(undefined);
    setPassword('');
    signIn({ email, password });
  };

  const validation =
    refused ?? (failure?.code === VALIDATION_ERROR_CODE.Validation ? failure : undefined);
  const emailError =
    validation?.field === VALIDATION_FIELD.Email ? t(EMAIL_RULE_KEYS[validation.rule]) : undefined;
  const passwordError =
    validation?.field === VALIDATION_FIELD.Password
      ? t(PASSWORD_RULE_KEYS[validation.rule])
      : undefined;
  const formFailure = refused === undefined ? failure : undefined;
  const formError =
    formFailure !== undefined &&
    (formFailure.code !== VALIDATION_ERROR_CODE.Validation ||
      (emailError === undefined && passwordError === undefined))
      ? t(SIGN_IN_ERROR_KEYS[formFailure.code])
      : undefined;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
      testID={TEST_IDS.signInScreen}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text accessibilityRole="header" style={styles.title}>
            {t('signIn.title')}
          </Text>
          <Text style={styles.message}>{t('signIn.message')}</Text>
          {endedBy === undefined ? null : <SessionNotice code={endedBy} />}
          <TextField
            label={t('signIn.email')}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setRefused(undefined);
            }}
            editable={!isPending}
            {...(emailError === undefined ? {} : { error: emailError })}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            inputMode="email"
            keyboardType="email-address"
            returnKeyType="next"
            spellCheck={false}
            submitBehavior="submit"
            textContentType="username"
            onSubmitEditing={() => {
              passwordInput.current?.focus();
            }}
            testID={TEST_IDS.signInEmail}
            errorTestID={TEST_IDS.signInEmailError}
          />
          <TextField
            label={t('signIn.password')}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setRefused(undefined);
            }}
            editable={!isPending}
            inputRef={passwordInput}
            {...(passwordError === undefined ? {} : { error: passwordError })}
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            returnKeyType="go"
            secureTextEntry
            spellCheck={false}
            textContentType="password"
            onSubmitEditing={submit}
            testID={TEST_IDS.signInPassword}
            errorTestID={TEST_IDS.signInPasswordError}
          />
          {formError === undefined ? null : (
            <LiveText message={formError} style={styles.error} testID={TEST_IDS.signInError} />
          )}
          <Button
            title={isPending ? t('signIn.submitting') : t('signIn.submit')}
            busy={isPending}
            onPress={submit}
            testID={TEST_IDS.signInSubmit}
          />
        </View>
        <DemoAccounts
          onPick={(account) => {
            setEmail(account.email);
            setPassword(account.password);
            setRefused(undefined);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  form: {
    width: '100%',
    maxWidth: maxContentWidth.form,
    alignSelf: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  message: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  error: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
