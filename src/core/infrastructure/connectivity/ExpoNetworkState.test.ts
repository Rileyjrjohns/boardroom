import { ExpoNetworkState } from './ExpoNetworkState';

// The native module cannot run in Jest, so it is replaced by one that records what it is asked:
// all there is to check in a wrapper that only hands the calls over.
const mockListeners = new Set<(state: unknown) => void>();
const mockState = { isConnected: true, isInternetReachable: false };

jest.mock('expo-network', () => ({
  getNetworkStateAsync: () => Promise.resolve(mockState),
  addNetworkStateListener: (listener: (state: unknown) => void) => {
    mockListeners.add(listener);
    return {
      remove: () => {
        mockListeners.delete(listener);
      },
    };
  },
}));

beforeEach(() => {
  mockListeners.clear();
});

describe('ExpoNetworkState', () => {
  it('hands over the state the module reports', async () => {
    expect(await new ExpoNetworkState().getState()).toEqual(mockState);
  });

  it('passes the events of the module to the listener until it is stopped', () => {
    const received: unknown[] = [];
    const stop = new ExpoNetworkState().subscribe((state) => received.push(state));

    for (const listener of mockListeners) listener({ isConnected: false });
    stop();
    for (const listener of mockListeners) listener({ isConnected: true });

    expect(received).toEqual([{ isConnected: false }]);
    expect(mockListeners.size).toBe(0);
  });
});
