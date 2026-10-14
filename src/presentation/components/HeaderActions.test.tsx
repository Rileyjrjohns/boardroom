import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { aPendingVote, aRejectedVote, aResolutionId, aVote } from '@domain/testing/builders';
import { createFakes } from '@application/testing/createFakes';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { ACCESS } from '../state/uiStore';
import { TEST_IDS } from '../testIds';
import { renderScreen } from '../testing/renderScreen';

import { HeaderActions } from './HeaderActions';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

describe('HeaderActions', () => {
  it('offers the pending votes and signing out, each at least as big as a touch target', async () => {
    const { t } = renderScreen(<HeaderActions />);
    await settle();

    const pending = screen.getByRole('button', { name: t('pendingVotes.open') });
    const signOut = screen.getByRole('button', { name: t('signOut.action') });

    expect(pending).toHaveStyle({ minHeight: 44, minWidth: 44 });
    expect(signOut).toHaveStyle({ minHeight: 44, minWidth: 44 });
  });

  it('shows no count when no vote is waiting', async () => {
    renderScreen(<HeaderActions />);
    await settle();

    expect(screen.queryByTestId(TEST_IDS.pendingVotesBadge)).toBeNull();
  });

  it('counts the votes that wait and the ones that were rejected, in the badge and in the name of the button', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(
      aPendingVote(aVote({ resolutionId: aResolutionId('r1') })),
      aPendingVote(aVote({ resolutionId: aResolutionId('r2') })),
      aRejectedVote(aVote({ resolutionId: aResolutionId('r3') })),
    );
    const { t } = renderScreen(<HeaderActions />, { fakes });
    await settle();

    expect(within(screen.getByTestId(TEST_IDS.pendingVotesBadge)).getByText('3')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: t('pendingVotes.openWithCount', { number: '3' }) }),
    ).toBeTruthy();
  });

  it('updates the count when the outbox changes', async () => {
    const fakes = createFakes();
    const { queryClient } = renderScreen(<HeaderActions />, { fakes });
    await settle();
    fakes.outbox.seed(aPendingVote(aVote({ resolutionId: aResolutionId('r1') })));

    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await settle();

    expect(within(screen.getByTestId(TEST_IDS.pendingVotesBadge)).getByText('1')).toBeTruthy();
  });

  it('asks for a confirmation before signing out, which says how many votes are kept', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aPendingVote(aVote({ resolutionId: aResolutionId('r1') })));
    const { t, uiStore } = renderScreen(<HeaderActions />, { fakes });
    await settle();

    fireEvent.press(screen.getByTestId(TEST_IDS.signOutButton));

    expect(screen.getByRole('header', { name: t('signOut.title') })).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.signOutPending)).toHaveTextContent(/^1 vote is waiting/);
    expect(uiStore.getState().access).toBe(ACCESS.Unlocked);
  });

  it('signs out only when the user confirms, and closes the confirmation when they cancel', async () => {
    const { fakes, uiStore } = renderScreen(<HeaderActions />);
    await settle();

    fireEvent.press(screen.getByTestId(TEST_IDS.signOutButton));
    fireEvent.press(screen.getByTestId(TEST_IDS.signOutCancel));
    expect(screen.queryByTestId(TEST_IDS.signOutDialog)).toBeNull();
    expect(fakes.auth.signOutCalls).toBe(0);

    fireEvent.press(screen.getByTestId(TEST_IDS.signOutButton));
    await act(async () => {
      fireEvent.press(screen.getByTestId(TEST_IDS.signOutConfirm));
    });
    await settle();

    expect(fakes.auth.signOutCalls).toBe(1);
    expect(uiStore.getState().access).toBe(ACCESS.SignedOut);
  });

  it.each(SUPPORTED_LANGUAGES)('is written in %s', async (language) => {
    const { t } = renderScreen(<HeaderActions />, { language });
    await settle();

    expect(screen.getByText(t('pendingVotes.open'))).toBeTruthy();
    expect(screen.getByText(t('signOut.action'))).toBeTruthy();
  });
});
