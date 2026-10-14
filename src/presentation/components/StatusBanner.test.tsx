import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import { MILLIS_PER_DAY, NOW, at } from '@domain/testing/builders';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { TEST_IDS } from '../testIds';
import { epochOf } from '../testing/accessEpoch';
import { renderScreen } from '../testing/renderScreen';

import { StatusBanner } from './StatusBanner';

// The one banner area of a screen: the connection of the device, a saved copy, and what the last
// synchronisation did. The two facts about the connection are told apart and can be true together.

afterEach(() => {
  jest.restoreAllMocks();
});

function goOffline(uiStore: ReturnType<typeof renderScreen>['uiStore']): void {
  act(() => {
    uiStore.getState().setConnectivity(CONNECTIVITY_STATUS.Offline);
  });
}

describe('StatusBanner', () => {
  it('shows nothing when the device is online, the data is current and nothing was synchronised', () => {
    renderScreen(<StatusBanner />);

    expect(screen.queryByTestId(TEST_IDS.statusBanner)).toBeNull();
  });

  it('says the device is offline, and what happens to a vote cast meanwhile', () => {
    const { uiStore, t } = renderScreen(<StatusBanner />);

    goOffline(uiStore);

    expect(screen.getByTestId(TEST_IDS.offlineBanner)).toHaveTextContent(t('banner.offline'));
    expect(screen.queryByTestId(TEST_IDS.staleBanner)).toBeNull();
  });

  it('says the data is a saved copy, and since when, without calling the device offline', () => {
    const { t, format } = renderScreen(<StatusBanner staleSince={NOW} />);

    expect(screen.getByTestId(TEST_IDS.staleBanner)).toHaveTextContent(
      t('states.staleData', { date: format.dateTime(NOW) }),
    );
    expect(screen.queryByTestId(TEST_IDS.offlineBanner)).toBeNull();
  });

  it('keeps the two facts apart but in one block, so that the screen has one calm banner area', () => {
    const earlier = at(-2 * MILLIS_PER_DAY);
    const { uiStore, t, format } = renderScreen(<StatusBanner staleSince={earlier} />);

    goOffline(uiStore);

    const banner = screen.getByTestId(TEST_IDS.statusBanner);
    expect(screen.getAllByTestId(TEST_IDS.statusBanner)).toHaveLength(1);
    expect(within(banner).getByTestId(TEST_IDS.offlineBanner)).toHaveTextContent(
      t('banner.offline'),
    );
    expect(within(banner).getByTestId(TEST_IDS.staleBanner)).toHaveTextContent(
      t('states.staleData', { date: format.dateTime(earlier) }),
    );
  });

  it('goes away when the connection returns', () => {
    const { uiStore } = renderScreen(<StatusBanner />);
    goOffline(uiStore);
    expect(screen.getByTestId(TEST_IDS.statusBanner)).toBeTruthy();

    act(() => {
      uiStore.getState().setConnectivity(CONNECTIVITY_STATUS.Online);
    });

    expect(screen.queryByTestId(TEST_IDS.statusBanner)).toBeNull();
  });

  describe('the result of a synchronisation', () => {
    it('says how many votes were sent, with the plural of the language', () => {
      const { uiStore, t } = renderScreen(<StatusBanner />);

      act(() => {
        uiStore.getState().showSyncSummary({ synced: 1, rejected: 0 }, epochOf(uiStore));
      });

      const summary = screen.getByTestId(TEST_IDS.syncSummary);
      expect(
        within(summary).getByText(t('banner.sent', { count: 1, formattedCount: '1' })),
      ).toBeTruthy();
      expect(within(summary).queryByText(/rejected/)).toBeNull();
    });

    it('says how many were rejected, and where to see them', () => {
      const { uiStore, t } = renderScreen(<StatusBanner />);

      act(() => {
        uiStore.getState().showSyncSummary({ synced: 0, rejected: 2 }, epochOf(uiStore));
      });

      const summary = screen.getByTestId(TEST_IDS.syncSummary);
      expect(
        within(summary).getByText(t('banner.rejected', { count: 2, formattedCount: '2' })),
      ).toBeTruthy();
      expect(within(summary).queryByText(/sent/)).toBeNull();
    });

    it('says both when both happened, as alerts', () => {
      const { uiStore } = renderScreen(<StatusBanner />);

      act(() => {
        uiStore.getState().showSyncSummary({ synced: 3, rejected: 1 }, epochOf(uiStore));
      });

      const alerts = within(screen.getByTestId(TEST_IDS.syncSummary)).getAllByRole('alert');
      expect(alerts.map((alert) => alert.props.accessibilityLiveRegion)).toEqual([
        'polite',
        'polite',
      ]);
    });

    it('is dismissed with its button, and nothing else goes with it', () => {
      const { uiStore } = renderScreen(<StatusBanner />);
      act(() => {
        uiStore.getState().setConnectivity(CONNECTIVITY_STATUS.Offline);
        uiStore.getState().showSyncSummary({ synced: 1, rejected: 0 }, epochOf(uiStore));
      });

      fireEvent.press(screen.getByTestId(TEST_IDS.syncSummaryDismiss));

      expect(screen.queryByTestId(TEST_IDS.syncSummary)).toBeNull();
      expect(screen.getByTestId(TEST_IDS.offlineBanner)).toBeTruthy();
      expect(uiStore.getState().syncSummary).toBeUndefined();
    });

    it('writes the count with the grouping of the locale', () => {
      const { uiStore } = renderScreen(<StatusBanner />, { language: 'fr' });

      act(() => {
        uiStore.getState().showSyncSummary({ synced: 1200, rejected: 0 }, epochOf(uiStore));
      });

      expect(screen.getByText(/1\s200 votes ont été envoyés\./)).toBeTruthy();
    });
  });

  describe('for the screen reader', () => {
    it('announces that the device is offline on iOS, once, when it happens', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      const { uiStore, t } = renderScreen(<StatusBanner />);
      announce.mockClear();

      goOffline(uiStore);

      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(t('banner.offline'));
    });

    it('is a polite alert on Android, which is how TalkBack reads what appears', () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const { uiStore } = renderScreen(<StatusBanner />);

      goOffline(uiStore);

      const alert = within(screen.getByTestId(TEST_IDS.offlineBanner));
      expect(screen.getByTestId(TEST_IDS.offlineBanner).props.accessibilityLiveRegion).toBe(
        'polite',
      );
      expect(alert).toBeTruthy();
    });
  });

  describe('in each language', () => {
    it.each(SUPPORTED_LANGUAGES)('is written in %s', (language) => {
      const { uiStore, t } = renderScreen(<StatusBanner staleSince={NOW} />, { language });

      goOffline(uiStore);

      expect(screen.getByTestId(TEST_IDS.offlineBanner)).toHaveTextContent(t('banner.offline'));
    });
  });

  describe('the notice that local data was reset', () => {
    function aNotice(localDataReset: boolean) {
      const acknowledge = jest.fn(() => Promise.resolve());
      return { acknowledge, notices: { localDataReset, acknowledgeLocalDataReset: acknowledge } };
    }

    it('says votes that were waiting on this device may have been lost, in the language of the user', () => {
      const { notices } = aNotice(true);
      const { t } = renderScreen(<StatusBanner />, { notices });

      expect(screen.getByTestId(TEST_IDS.localDataResetNotice)).toHaveTextContent(
        t('banner.localDataReset'),
      );
      expect(t('banner.localDataReset')).toMatch(/votes/i);
    });

    it('says it in French too', () => {
      const { notices } = aNotice(true);
      const { t } = renderScreen(<StatusBanner />, { notices, language: SUPPORTED_LANGUAGES[1] });

      expect(screen.getByTestId(TEST_IDS.localDataResetNotice)).toHaveTextContent(
        t('banner.localDataReset'),
      );
      expect(t('banner.localDataReset')).toMatch(/votes/i);
    });

    it('is not there when nothing was reset', () => {
      const { notices } = aNotice(false);
      renderScreen(<StatusBanner />, { notices });

      expect(screen.queryByTestId(TEST_IDS.statusBanner)).toBeNull();
    });

    it('stays until the user has read it, then goes and is forgotten for good', async () => {
      const { notices, acknowledge } = aNotice(true);
      const { uiStore } = renderScreen(<StatusBanner />, { notices });

      await act(async () => {
        fireEvent.press(screen.getByTestId(TEST_IDS.localDataResetDismiss));
      });

      expect(screen.queryByTestId(TEST_IDS.statusBanner)).toBeNull();
      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(uiStore.getState().localDataResetNotice).toBe(false);
    });

    it('is told with the other facts in the one banner, and dismissed on its own', async () => {
      const { notices } = aNotice(true);
      const { uiStore } = renderScreen(<StatusBanner />, { notices });
      goOffline(uiStore);

      await act(async () => {
        fireEvent.press(screen.getByTestId(TEST_IDS.localDataResetDismiss));
      });

      expect(screen.getByTestId(TEST_IDS.offlineBanner)).toBeTruthy();
      expect(screen.queryByTestId(TEST_IDS.localDataResetNotice)).toBeNull();
    });

    it('is not forgotten when the user leaves the open app, which does not make them read it', () => {
      const { notices } = aNotice(true);
      const { uiStore } = renderScreen(<StatusBanner />, { notices });

      act(() => {
        uiStore.getState().signedOut();
        uiStore.getState().signedIn();
      });

      expect(screen.getByTestId(TEST_IDS.localDataResetNotice)).toBeTruthy();
    });
  });
});
