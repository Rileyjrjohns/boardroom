import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { BIOMETRIC_ERROR_CODE } from '@domain/errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import type { UnexpectedError } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';
import type { CastVoteError } from '@application/use-cases/votes/CastVote';

import { castVoteErrorText } from '../i18n/voteMessages';
import { VOTE_CHOICE_KEYS } from '../i18n/translationKeys';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, fontWeights } from '../theme/tokens';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { LiveText } from './LiveText';

/**
 * The failures after which pressing "confirm" again can work: the prompt was cancelled or did not
 * recognise the user, the device refused to let them try for a while, the vote could not be saved.
 * Every other one is final for this vote (the resolution closed, the user voted elsewhere, the
 * device cannot do biometrics, the session is over): the only thing left to do is close the dialog.
 */
const RETRYABLE_FAILURES: ReadonlySet<string> = new Set([
  BIOMETRIC_ERROR_CODE.Cancelled,
  BIOMETRIC_ERROR_CODE.Failed,
  BIOMETRIC_ERROR_CODE.LockedOut,
  STORAGE_ERROR_CODE.WriteFailed,
  STORAGE_ERROR_CODE.ReadFailed,
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Unexpected,
]);

export function isRetryableVoteFailure(failure: CastVoteError | UnexpectedError): boolean {
  return RETRYABLE_FAILURES.has(failure.code);
}

interface VoteDialogProps {
  /** The choice under review. Without one the dialog is closed. */
  readonly choice: VoteChoice | undefined;
  /** The title of the resolution being voted on. */
  readonly resolutionTitle: string;
  /** Whether the device says it is offline: the vote will be saved and sent later. */
  readonly offline: boolean;
  /** The vote is being cast: the biometric prompt is up, or the server is answering. */
  readonly pending: boolean;
  /** Why the last attempt failed. */
  readonly failure: CastVoteError | UnexpectedError | undefined;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

/**
 * The confirmation step of a vote. It states, before anything is cast, what the user is about to
 * do and that it is final, and it is the only place a vote is cast from: confirming asks for the
 * biometric proof (`CastVote`), and every outcome that is not a success is told here, in the
 * dialog, with the choice still under review so that the user can try again when trying again can
 * help. Pending, the confirm button is busy and cannot be pressed again, so one tap casts one
 * vote.
 */
export function VoteDialog({
  choice,
  resolutionTitle,
  offline,
  pending,
  failure,
  onConfirm,
  onDismiss,
}: VoteDialogProps) {
  const { t } = useTranslation();
  const dismiss = () => {
    if (!pending) onDismiss();
  };
  const final = failure !== undefined && !isRetryableVoteFailure(failure);

  return (
    <Dialog
      visible={choice !== undefined}
      title={t('voting.confirmTitle')}
      onDismiss={dismiss}
      testID={TEST_IDS.voteDialog}
      actions={
        final ? (
          <Button
            title={t('common.close')}
            variant="secondary"
            onPress={dismiss}
            testID={TEST_IDS.voteClose}
          />
        ) : (
          <>
            <Button
              title={t('common.cancel')}
              variant="secondary"
              disabled={pending}
              onPress={dismiss}
              testID={TEST_IDS.voteCancel}
            />
            <Button
              title={pending ? t('voting.confirming') : t('voting.confirm')}
              busy={pending}
              onPress={onConfirm}
              testID={TEST_IDS.voteConfirm}
            />
          </>
        )
      }
    >
      <Text style={styles.resolution}>{resolutionTitle}</Text>
      {choice === undefined ? null : (
        <Text style={styles.choice} testID={TEST_IDS.voteDialogChoice}>
          {t('voting.confirmChoice', { choice: t(VOTE_CHOICE_KEYS[choice]) })}
        </Text>
      )}
      <Text style={styles.text} testID={TEST_IDS.voteDialogFinal}>
        {t('voting.confirmFinal')}
      </Text>
      <Text style={styles.text}>{t('voting.confirmBiometric')}</Text>
      {offline ? (
        <Text style={styles.text} testID={TEST_IDS.voteDialogOffline}>
          {t('voting.confirmOffline')}
        </Text>
      ) : null}
      {failure === undefined ? null : (
        <LiveText
          message={castVoteErrorText(t, failure)}
          style={styles.error}
          testID={TEST_IDS.voteDialogError}
        />
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  resolution: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  choice: {
    fontSize: fontSizes.subtitle,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  text: {
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  error: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
