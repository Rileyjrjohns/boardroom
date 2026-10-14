import { act } from '@testing-library/react-native';

import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import { createFakes } from '@application/testing/createFakes';

import { renderScreen } from '../testing/renderScreen';

import { useConnectivityStatus } from './useConnectivityStatus';

// The connection of the device, followed through the use case, for the banner and for the
// synchronisation. It needs no session: it starts with the app.

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

function Probe({ onOnline }: { readonly onOnline: () => void }) {
  useConnectivityStatus(onOnline);
  return null;
}

function render(onOnline = jest.fn(), options: Parameters<typeof renderScreen>[1] = {}) {
  const rendered = renderScreen(<Probe onOnline={onOnline} />, options);
  return { ...rendered, onOnline };
}

describe('useConnectivityStatus', () => {
  it('tells the store what the device says at the start', async () => {
    const fakes = createFakes();
    fakes.connectivity.emit(CONNECTIVITY_STATUS.Offline);
    const { uiStore, onOnline } = render(jest.fn(), { fakes });

    await settle();

    expect(uiStore.getState().connectivity).toBe(CONNECTIVITY_STATUS.Offline);
    expect(onOnline).not.toHaveBeenCalled();
  });

  it('follows each change, and asks for the votes to be sent when the connection comes back', async () => {
    const { fakes, uiStore, onOnline } = render();
    await settle();

    act(() => {
      fakes.connectivity.emit(CONNECTIVITY_STATUS.Offline);
    });
    expect(uiStore.getState().connectivity).toBe(CONNECTIVITY_STATUS.Offline);
    expect(onOnline).not.toHaveBeenCalled();

    act(() => {
      fakes.connectivity.emit(CONNECTIVITY_STATUS.Online);
    });
    expect(uiStore.getState().connectivity).toBe(CONNECTIVITY_STATUS.Online);
    expect(onOnline).toHaveBeenCalledTimes(1);
  });

  it('listens once, and stops listening when it is unmounted', async () => {
    const { fakes, unmount } = render();
    await settle();
    expect(fakes.connectivity.listenerCount).toBe(1);

    unmount();

    expect(fakes.connectivity.listenerCount).toBe(0);
  });

  it('does not keep listening when it is unmounted before the use case has answered', async () => {
    const { fakes, unmount } = render();

    unmount();
    await settle();

    expect(fakes.connectivity.listenerCount).toBe(0);
  });

  it('calls the latest callback it was given, not the first', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { fakes, rerender } = render(first);
    await settle();

    rerender(<Probe onOnline={second} />);
    act(() => {
      fakes.connectivity.emit(CONNECTIVITY_STATUS.Offline);
      fakes.connectivity.emit(CONNECTIVITY_STATUS.Online);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
