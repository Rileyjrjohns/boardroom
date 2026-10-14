import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import type { ConnectivityStatus } from '@application/ports/Connectivity';
import { describeConnectivityContract } from '@application/testing/contracts/connectivityContract';

import { MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';

import { FakeNetworkState } from '../testing/FakeNetworkState';

import { ExpoConnectivity, statusOf } from './ExpoConnectivity';

const { Online, Offline } = CONNECTIVITY_STATUS;

/** Lets what the adapter does in the background (reading the starting point) finish. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describeConnectivityContract('ExpoConnectivity', () => {
  const platform = new FakeNetworkState();
  return {
    connectivity: new ExpoConnectivity({ api: platform, monitoring: new FakeMonitoring() }),
    report: async (status) => {
      platform.change(
        status === Online
          ? { isConnected: true, isInternetReachable: true }
          : { isConnected: false, isInternetReachable: false },
      );
      await settle();
    },
  };
});

describe('statusOf', () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, Online],
    [{ isConnected: false, isInternetReachable: false }, Offline],
    [{ isConnected: false }, Offline],
    [{ isConnected: true, isInternetReachable: false }, Offline],
    [{ isConnected: false, isInternetReachable: true }, Offline],
    [{ isConnected: true }, Online],
    [{ isInternetReachable: true }, Online],
    [{}, Online],
    [{ isConnected: undefined, isInternetReachable: undefined }, Online],
  ] as const)('reads %j as %s', (state, status) => {
    expect(statusOf(state)).toBe(status);
  });
});

describe('ExpoConnectivity', () => {
  function aConnectivity(platform = new FakeNetworkState()) {
    const monitoring = new FakeMonitoring();
    return {
      platform,
      monitoring,
      connectivity: new ExpoConnectivity({ api: platform, monitoring, timeoutMillis: 20 }),
    };
  }

  it('is online when the platform cannot be asked, and when it does not answer in time', async () => {
    const { platform, connectivity } = aConnectivity();
    platform.failure = new Error('no module');
    expect(await connectivity.current()).toBe(Online);

    platform.failure = undefined;
    platform.hanging = true;
    expect(await connectivity.current()).toBe(Online);
  });

  it('listens to the platform once for any number of subscribers, and stops when the last one leaves', async () => {
    const { platform, connectivity } = aConnectivity();
    const stopFirst = connectivity.subscribe(() => undefined);
    const stopSecond = connectivity.subscribe(() => undefined);
    await settle();

    expect(platform.subscriptions).toBe(1);
    expect(platform.listeners.size).toBe(1);

    stopFirst();
    expect(platform.listeners.size).toBe(1);
    stopSecond();
    expect(platform.listeners.size).toBe(0);
  });

  it('starts listening again, and reads the starting point again, for a later subscriber', async () => {
    const { platform, connectivity } = aConnectivity();
    const first: ConnectivityStatus[] = [];
    const stop = connectivity.subscribe((status) => first.push(status));
    await settle();
    stop();
    platform.state = { isConnected: false };

    const second: ConnectivityStatus[] = [];
    connectivity.subscribe((status) => second.push(status));
    await settle();
    platform.change({ isConnected: false, isInternetReachable: false });
    await settle();
    platform.change({ isConnected: true, isInternetReachable: true });
    await settle();

    expect(platform.subscriptions).toBe(2);
    expect(second).toEqual([Online]);
  });

  it('does not take a report of the platform that repeats what it said for a change', async () => {
    const { platform, connectivity } = aConnectivity();
    const received: ConnectivityStatus[] = [];
    connectivity.subscribe((status) => received.push(status));
    await settle();

    platform.change({ isConnected: true, isInternetReachable: undefined });
    platform.change({ isConnected: true, isInternetReachable: true });
    platform.change({ isConnected: false });
    platform.change({ isConnected: false, isInternetReachable: false });
    await settle();

    expect(received).toEqual([Offline]);
  });

  it('knows the starting point when the first report comes before it has been read', async () => {
    const { platform, connectivity } = aConnectivity();
    platform.state = { isConnected: false };
    const received: ConnectivityStatus[] = [];
    connectivity.subscribe((status) => received.push(status));

    // The platform confirms what it said at the start, before the adapter has read it.
    platform.change({ isConnected: false });
    await settle();

    expect(received).toEqual([]);
  });

  it('drops a report that arrives after the last subscriber left', async () => {
    const { platform, connectivity } = aConnectivity();
    const received: ConnectivityStatus[] = [];
    const stop = connectivity.subscribe((status) => received.push(status));
    await settle();

    platform.change({ isConnected: false });
    stop();
    await settle();

    expect(received).toEqual([]);
  });

  it('reports a listener that throws to the monitoring, once for each change, without a cause that says what it was', async () => {
    const { platform, connectivity, monitoring } = aConnectivity();
    const heard: ConnectivityStatus[] = [];
    connectivity.subscribe(() => {
      throw new Error('secret detail of the listener');
    });
    connectivity.subscribe((status) => heard.push(status));
    await settle();

    platform.change({ isConnected: false });
    await settle();
    platform.change({ isConnected: true, isInternetReachable: true });
    await settle();

    expect(heard).toEqual([Offline, Online]);
    expect(monitoring.capturedEvents()).toEqual([
      MONITORING_EVENT.ConnectivityListenerFailed,
      MONITORING_EVENT.ConnectivityListenerFailed,
    ]);
    expect(JSON.stringify(monitoring.errors)).not.toContain('secret detail');
  });

  it('keeps listening to the platform while one of two subscriptions of the same function is left', async () => {
    const { platform, connectivity } = aConnectivity();
    const listener = jest.fn();
    const stopFirst = connectivity.subscribe(listener);
    const stopSecond = connectivity.subscribe(listener);
    await settle();

    stopFirst();
    expect(platform.listeners.size).toBe(1);
    stopSecond();

    expect(platform.listeners.size).toBe(0);
  });
});
