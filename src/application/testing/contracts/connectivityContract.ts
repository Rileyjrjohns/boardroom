import { CONNECTIVITY_STATUS } from '../../ports/Connectivity';
import type { Connectivity, ConnectivityStatus } from '../../ports/Connectivity';

export interface ConnectivityHarness {
  readonly connectivity: Connectivity;
  /** Makes the device report this status, the way the platform would. Online at first. */
  report(status: ConnectivityStatus): void | Promise<void>;
}

export type ConnectivityFactory = () => ConnectivityHarness | Promise<ConnectivityHarness>;

const { Online, Offline } = CONNECTIVITY_STATUS;

/**
 * The contract of `Connectivity`, as a suite any implementation runs: the status it reports, the
 * changes it announces (and only changes), and subscriptions that stop on their own, each one a
 * handle of its own, whose listener cannot hurt the others by throwing. The factory returns a
 * device that is online and has no subscriber.
 */
export function describeConnectivityContract(
  name: string,
  createHarness: ConnectivityFactory,
): void {
  describe(`${name} honours the Connectivity contract`, () => {
    let harness: ConnectivityHarness;
    let connectivity: Connectivity;

    beforeEach(async () => {
      harness = await createHarness();
      connectivity = harness.connectivity;
    });

    it('reports the status of the device, now', async () => {
      expect(await connectivity.current()).toBe(Online);

      await harness.report(Offline);
      expect(await connectivity.current()).toBe(Offline);

      await harness.report(Online);
      expect(await connectivity.current()).toBe(Online);
    });

    it('does not call a listener when it subscribes', async () => {
      const received: ConnectivityStatus[] = [];

      connectivity.subscribe((status) => received.push(status));
      await connectivity.current();

      expect(received).toEqual([]);
    });

    it('calls a listener for each change, in order', async () => {
      const received: ConnectivityStatus[] = [];
      connectivity.subscribe((status) => received.push(status));

      await harness.report(Offline);
      await harness.report(Online);
      await harness.report(Offline);

      expect(received).toEqual([Offline, Online, Offline]);
    });

    it('does not call a listener twice in a row with the same status', async () => {
      const received: ConnectivityStatus[] = [];
      connectivity.subscribe((status) => received.push(status));

      await harness.report(Online);
      await harness.report(Offline);
      await harness.report(Offline);
      await harness.report(Online);
      await harness.report(Online);

      expect(received).toEqual([Offline, Online]);
    });

    it('calls every subscriber, and stops each one on its own', async () => {
      const first: ConnectivityStatus[] = [];
      const second: ConnectivityStatus[] = [];
      const stopFirst = connectivity.subscribe((status) => first.push(status));
      connectivity.subscribe((status) => second.push(status));

      await harness.report(Offline);
      stopFirst();
      await harness.report(Online);

      expect(first).toEqual([Offline]);
      expect(second).toEqual([Offline, Online]);
    });

    it('lets a subscriber unsubscribe twice without harm to the others', async () => {
      const kept: ConnectivityStatus[] = [];
      const stop = connectivity.subscribe(() => undefined);
      connectivity.subscribe((status) => kept.push(status));

      stop();
      stop();
      await harness.report(Offline);

      expect(kept).toEqual([Offline]);
    });

    it('makes a subscription of its own each time, even for the same function', async () => {
      const received: ConnectivityStatus[] = [];
      const listener = (status: ConnectivityStatus) => received.push(status);
      const stopFirst = connectivity.subscribe(listener);
      connectivity.subscribe(listener);

      await harness.report(Offline);
      stopFirst();
      await harness.report(Online);

      expect(received).toEqual([Offline, Offline, Online]);
    });

    it('lets a function that subscribed twice stop one subscription twice without stopping the other', async () => {
      const received: ConnectivityStatus[] = [];
      const listener = (status: ConnectivityStatus) => received.push(status);
      const stopFirst = connectivity.subscribe(listener);
      connectivity.subscribe(listener);

      stopFirst();
      stopFirst();
      await harness.report(Offline);

      expect(received).toEqual([Offline]);
    });

    it('does not let a listener that throws stop the others hearing the change, nor escape', async () => {
      const before: ConnectivityStatus[] = [];
      const after: ConnectivityStatus[] = [];
      connectivity.subscribe((status) => before.push(status));
      connectivity.subscribe(() => {
        throw new Error('broken listener');
      });
      connectivity.subscribe((status) => after.push(status));

      await expect(Promise.resolve(harness.report(Offline))).resolves.toBeUndefined();
      await harness.report(Online);

      expect(before).toEqual([Offline, Online]);
      expect(after).toEqual([Offline, Online]);
    });

    it('lets the status change when nobody listens', async () => {
      await harness.report(Offline);

      expect(await connectivity.current()).toBe(Offline);
    });
  });
}
