import { act, fireEvent, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { createFakes } from '@testing/application/createFakes';
import { aPendingVote, aResolutionId, aVote } from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';

import { SignOutDialog } from './SignOutDialog';
import { AUTH_TEST_IDS } from '../testIds';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SignOutDialog', () => {
  it('says what signing out means, and nothing about votes when none waits', () => {
    const { t } = renderScreen(<SignOutDialog visible pendingCount={0} onDismiss={jest.fn()} />);

    expect(screen.getByRole('header', { name: t('signOut.title') })).toBeTruthy();
    expect(screen.getByText(t('signOut.message'))).toBeTruthy();
    expect(screen.queryByTestId(AUTH_TEST_IDS.signOutPending)).toBeNull();
  });

  it.each([
    [
      1,
      'en',
      '1 vote is waiting to be sent. It is kept on this device and will be sent after your next sign-in.',
    ],
    [
      3,
      'en',
      '3 votes are waiting to be sent. They are kept on this device and will be sent after your next sign-in.',
    ],
    [
      1,
      'fr',
      '1 vote est en attente d’envoi. Il est conservé sur cet appareil et sera envoyé après votre prochaine connexion.',
    ],
    [
      2,
      'fr',
      '2 votes sont en attente d’envoi. Ils sont conservés sur cet appareil et seront envoyés après votre prochaine connexion.',
    ],
  ] as const)(
    'says how many votes wait and that they are kept, for %i in %s',
    (count, language, text) => {
      renderScreen(<SignOutDialog visible pendingCount={count} onDismiss={jest.fn()} />, {
        language,
      });

      expect(screen.getByTestId(AUTH_TEST_IDS.signOutPending)).toHaveTextContent(text);
    },
  );

  it('says it in general terms when the screen cannot know how many wait', () => {
    const { t } = renderScreen(
      <SignOutDialog visible pendingCount={undefined} onDismiss={jest.fn()} />,
    );

    expect(screen.getByTestId(AUTH_TEST_IDS.signOutPending)).toHaveTextContent(
      t('signOut.pendingUnknown'),
    );
  });

  it('keeps the votes that wait when the user signs out, and empties the rest', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aPendingVote(aVote({ resolutionId: aResolutionId('r1') })));
    const { accessStore } = renderScreen(
      <SignOutDialog visible pendingCount={1} onDismiss={jest.fn()} />,
      { fakes },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signOutConfirm));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(accessStore.getState().access).toBe(ACCESS.SignedOut);
    expect(fakes.outbox.snapshot()).toHaveLength(1);
    expect(fakes.auth.session).toBeUndefined();
  });

  it('asks to be closed by its cancel button and by the back button, and signs nobody out', () => {
    const onDismiss = jest.fn();
    const { fakes } = renderScreen(
      <SignOutDialog visible pendingCount={0} onDismiss={onDismiss} />,
    );

    fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signOutCancel));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(fakes.auth.signOutCalls).toBe(0);
  });

  it('makes the destructive action look like one, and puts the safe one first', () => {
    const { t } = renderScreen(<SignOutDialog visible pendingCount={0} onDismiss={jest.fn()} />);

    const names = screen.getAllByRole('button').map((button) => button.props.testID);

    expect(names).toEqual([AUTH_TEST_IDS.signOutCancel, AUTH_TEST_IDS.signOutConfirm]);
    expect(screen.getByRole('button', { name: t('signOut.action') })).toBeTruthy();
  });

  describe('while the sign-out is under way', () => {
    /** The sign-out waits for the test: the session is only forgotten once it lets it through. */
    function holdSignOut(fakes: ReturnType<typeof createFakes>) {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const signOut = fakes.auth.signOut.bind(fakes.auth);
      fakes.auth.signOut = async () => {
        await gate;
        return signOut();
      };
      return () => release();
    }

    it('cannot be closed with the back button, nor with the cancel button', async () => {
      const fakes = createFakes();
      holdSignOut(fakes);
      const onDismiss = jest.fn();
      renderScreen(<SignOutDialog visible pendingCount={0} onDismiss={onDismiss} />, { fakes });
      await act(async () => {
        fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signOutConfirm));
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      act(() => {
        screen.UNSAFE_getByType(Modal).props.onRequestClose();
      });
      fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signOutCancel));

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('can be closed again once it has ended', async () => {
      const fakes = createFakes();
      fakes.auth.signOutFailure = storageWriteFailed();
      const onDismiss = jest.fn();
      renderScreen(<SignOutDialog visible pendingCount={0} onDismiss={onDismiss} />, { fakes });
      await act(async () => {
        fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signOutConfirm));
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      act(() => {
        screen.UNSAFE_getByType(Modal).props.onRequestClose();
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the session cannot be forgotten', () => {
    it('follows the use case, which has locked the app, to the lock screen', async () => {
      const fakes = createFakes();
      fakes.auth.signOutFailure = storageWriteFailed();
      const { accessStore, queryClient } = renderScreen(
        <SignOutDialog visible pendingCount={0} onDismiss={jest.fn()} />,
        { fakes },
      );
      queryClient.setQueryData(['rows'], 'the rows of the user');

      await act(async () => {
        fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signOutConfirm));
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(fakes.appLock.isLocked()).toBe(true);
      expect(accessStore.getState().access).toBe(ACCESS.Locked);
      expect(queryClient.getQueryData(['rows'])).toBeUndefined();
    });
  });
});
