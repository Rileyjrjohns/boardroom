import { act, fireEvent, screen } from '@testing-library/react-native';

import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import { renderScreen } from '@testing/presentation/renderScreen';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';

import { DemoOfflineSwitch } from './DemoControls';
import { CORE_TEST_IDS } from '@core/presentation/testIds';

// The switch of the simulated server. It exists in the mock configuration only, is marked as the
// demo, and drives the connection of the whole app: the screens learn it as they would on a device.

describe('DemoOfflineSwitch', () => {
  it('is absent when the services have no demo controls, which is every configuration but the mock one', () => {
    renderScreen(<DemoOfflineSwitch />);

    expect(screen.queryByTestId(CORE_TEST_IDS.demoPanel)).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('is a switch with a name and a hint, marked as the demo', () => {
    const { t } = renderScreen(<DemoOfflineSwitch />, { demo: true });

    const control = screen.getByRole('switch', { name: t('demo.offline') });

    expect(control.props.accessibilityHint).toBe(t('demo.offlineHint'));
    expect(screen.getByText(t('demo.badge'))).toBeTruthy();
    expect(control).toHaveStyle({ minHeight: 44 });
  });

  it('starts online: the switch is off', () => {
    renderScreen(<DemoOfflineSwitch />, { demo: true });

    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('cuts the simulated server when it is turned on: the network, and what the device reports', () => {
    const { fakes, demoNetwork, uiStore } = renderScreen(<DemoOfflineSwitch />, { demo: true });

    fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));

    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: true });
    expect(demoNetwork?.online).toBe(false);
    expect(fakes.network.online).toBe(false);
    expect(uiStore.getState().connectivity).toBe(CONNECTIVITY_STATUS.Online);
  });

  it('brings it back when it is turned off again', () => {
    const { fakes, demoNetwork } = renderScreen(<DemoOfflineSwitch />, { demo: true });
    fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));

    fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));

    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: false });
    expect(demoNetwork?.online).toBe(true);
    expect(fakes.network.online).toBe(true);
  });

  it('follows the network when something else cuts it, so that it never shows a state that is not the real one', () => {
    const { demoNetwork } = renderScreen(<DemoOfflineSwitch />, { demo: true });

    act(() => {
      demoNetwork?.setOnline(false);
    });

    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('stops listening to the network when it leaves the screen', () => {
    const { demoNetwork, unmount } = renderScreen(<DemoOfflineSwitch />, { demo: true });
    const listen = jest.spyOn(demoNetwork!, 'subscribe');
    unmount();

    act(() => {
      demoNetwork?.setOnline(false);
    });

    expect(listen).not.toHaveBeenCalled();
  });

  it.each(SUPPORTED_LANGUAGES)('is written in %s', (language) => {
    const { t } = renderScreen(<DemoOfflineSwitch />, { demo: true, language });

    expect(screen.getByRole('switch', { name: t('demo.offline') })).toBeTruthy();
    expect(screen.getByText(t('demo.badge'))).toBeTruthy();
  });
});
