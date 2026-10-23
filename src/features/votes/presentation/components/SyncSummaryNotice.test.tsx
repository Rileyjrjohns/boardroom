import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { epochOf } from '@composition/shell/testing/accessEpoch';
import { StatusBanner } from '@core/presentation/components/StatusBanner';
import { renderScreen, renderScreenHook } from '@testing/presentation/renderScreen';

import { VOTES_TEST_IDS } from '../testIds';

import { SYNC_SUMMARY_NOTICES } from './SyncSummaryNotice';

// What the votes add to the banner of the screens (the slot of the shared banner): the sum of the
// synchronisations, until the user has read it. The banner with every other fact is tested in
// core/presentation/components/StatusBanner.test.tsx.

describe('SYNC_SUMMARY_NOTICES', () => {
  it('has something to tell once a synchronisation sent or refused a vote, until it is dismissed', () => {
    const { result, accessStore, voteSyncStore } = renderScreenHook(() =>
      SYNC_SUMMARY_NOTICES.useHasNotices(),
    );
    expect(result.current).toBe(false);

    act(() => {
      voteSyncStore.getState().showSyncSummary({ synced: 1, rejected: 0 }, epochOf(accessStore));
    });
    expect(result.current).toBe(true);

    act(() => {
      voteSyncStore.getState().dismissSyncSummary();
    });
    expect(result.current).toBe(false);
  });

  it('is the summary of the banner: the counts, and a button that dismisses it', () => {
    const { accessStore, voteSyncStore, t } = renderScreen(<StatusBanner />);
    act(() => {
      voteSyncStore.getState().showSyncSummary({ synced: 2, rejected: 1 }, epochOf(accessStore));
    });

    const summary = screen.getByTestId(VOTES_TEST_IDS.syncSummary);
    expect(
      within(summary).getByText(t('banner.sent', { count: 2, formattedCount: '2' })),
    ).toBeTruthy();
    expect(
      within(summary).getByText(t('banner.rejected', { count: 1, formattedCount: '1' })),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId(VOTES_TEST_IDS.syncSummaryDismiss));

    expect(voteSyncStore.getState().syncSummary).toBeUndefined();
    expect(screen.queryByTestId(VOTES_TEST_IDS.syncSummary)).toBeNull();
  });

  it('renders nothing of its own while there is nothing to tell', () => {
    const { Notices } = SYNC_SUMMARY_NOTICES;
    renderScreen(<Notices />);

    expect(screen.queryByTestId(VOTES_TEST_IDS.syncSummary)).toBeNull();
  });
});
