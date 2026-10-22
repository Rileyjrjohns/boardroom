import { CONNECTIVITY_STATUS } from '../../ports/Connectivity';
import type { Connectivity, ConnectivityStatus } from '../../ports/Connectivity';
import type { Unsubscribe } from '../../ports/types/Unsubscribe';
import { createFakes } from '../../testing/createFakes';

import { ObserveConnectivity } from './ObserveConnectivity';

const { Online, Offline } = CONNECTIVITY_STATUS;

function observer() {
  const fakes = createFakes();
  const received: ConnectivityStatus[] = [];
  const observe = () =>
    new ObserveConnectivity(fakes).execute((status) => {
      received.push(status);
    });
  return { fakes, received, observe };
}

describe('ObserveConnectivity', () => {
  it('starts from the status of the device, without announcing it as a change', async () => {
    const { fakes, received, observe } = observer();
    fakes.connectivity.emit(Offline);

    const observation = await observe();

    expect(observation.status).toBe(Offline);
    expect(received).toEqual([]);
  });

  it('announces each change after the start, in order', async () => {
    const { fakes, received, observe } = observer();
    await observe();

    fakes.connectivity.emit(Offline);
    fakes.connectivity.emit(Online);

    expect(received).toEqual([Offline, Online]);
  });

  it('does not announce a status that repeats, whatever the adapter does', async () => {
    const received: ConnectivityStatus[] = [];
    let report: (status: ConnectivityStatus) => void = () => undefined;
    const noisy: Connectivity = {
      current: () => Promise.resolve(Online),
      subscribe: (listener) => {
        report = listener;
        return () => undefined;
      },
    };
    await new ObserveConnectivity({ connectivity: noisy }).execute((status) => {
      received.push(status);
    });

    report(Online);
    report(Offline);
    report(Offline);
    report(Online);

    expect(received).toEqual([Offline, Online]);
  });

  it('starts listening before it reads the status, so that no change is missed', async () => {
    const received: ConnectivityStatus[] = [];
    let report: (status: ConnectivityStatus) => void = () => undefined;
    let answer: (status: ConnectivityStatus) => void = () => undefined;
    const slow: Connectivity = {
      current: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      subscribe: (listener) => {
        report = listener;
        return () => undefined;
      },
    };
    const started = new ObserveConnectivity({ connectivity: slow }).execute((status) => {
      received.push(status);
    });

    // The device goes offline while the status is being read; the read answers with the old one.
    report(Offline);
    answer(Online);
    const observation = await started;

    expect(observation.status).toBe(Offline);
    expect(received).toEqual([]);
  });

  it('stops announcing once it is unsubscribed, which can be done twice', async () => {
    const { fakes, received, observe } = observer();
    const { unsubscribe } = await observe();

    fakes.connectivity.emit(Offline);
    unsubscribe();
    unsubscribe();
    fakes.connectivity.emit(Online);

    expect(received).toEqual([Offline]);
    expect(fakes.connectivity.listenerCount).toBe(0);
  });

  it('unsubscribes from the port once, not once per call', async () => {
    let unsubscribed = 0;
    const counting: Connectivity = {
      current: () => Promise.resolve(Online),
      subscribe: (): Unsubscribe => () => {
        unsubscribed += 1;
      },
    };
    const { unsubscribe } = await new ObserveConnectivity({ connectivity: counting }).execute(
      () => undefined,
    );

    unsubscribe();
    unsubscribe();

    expect(unsubscribed).toBe(1);
  });

  it('keeps independent observations apart', async () => {
    const { fakes, received, observe } = observer();
    const first = await observe();
    await observe();

    first.unsubscribe();
    fakes.connectivity.emit(Offline);

    expect(received).toEqual([Offline]);
  });
});
