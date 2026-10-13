import { networkUnavailable } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import { aDuration } from '@domain/testing/builders';

import { immediateSleep, recordingSleep } from '../testing/sleep';

import { MAX_SIMULATED_LATENCY_MILLIS, SimulatedNetwork } from './SimulatedNetwork';

describe('SimulatedNetwork', () => {
  it('is online by default, and lets a request in', async () => {
    const network = new SimulatedNetwork({ sleep: immediateSleep, latency: aDuration(0) });

    expect(network.online).toBe(true);
    expect(await network.enter()).toStrictEqual(ok(undefined));
  });

  it('can start offline', async () => {
    const network = new SimulatedNetwork({
      sleep: immediateSleep,
      latency: aDuration(0),
      online: false,
    });

    expect(network.online).toBe(false);
    expect(await network.enter()).toStrictEqual(err(networkUnavailable()));
  });

  it('goes offline and online again, as told', async () => {
    const network = new SimulatedNetwork({ sleep: immediateSleep, latency: aDuration(0) });

    network.goOffline();
    expect(await network.enter()).toStrictEqual(err(networkUnavailable()));
    network.goOnline();
    expect(await network.enter()).toStrictEqual(ok(undefined));
    network.setOnline(false);
    expect(network.online).toBe(false);
    network.setOnline(true);
    expect(network.online).toBe(true);
  });

  it('waits for the latency before letting a request in, through the sleep it was given', async () => {
    const { sleep, requested } = recordingSleep();
    const network = new SimulatedNetwork({ sleep, latency: aDuration(250) });

    await network.enter();

    expect(requested).toEqual([250]);
  });

  it('applies a latency set later', async () => {
    const { sleep, requested } = recordingSleep();
    const network = new SimulatedNetwork({ sleep, latency: aDuration(0) });

    network.setLatency(aDuration(900));
    await network.enter();

    expect(network.latency).toBe(900);
    expect(requested).toEqual([900]);
  });

  it('never waits longer than the cap, whatever latency is configured', async () => {
    const { sleep, requested } = recordingSleep();
    const network = new SimulatedNetwork({ sleep, latency: aDuration(3_600_000) });

    await network.enter();

    expect(requested).toEqual([MAX_SIMULATED_LATENCY_MILLIS]);
  });

  it('does not wait at all when offline: the failure is immediate', async () => {
    const { sleep, requested } = recordingSleep();
    const network = new SimulatedNetwork({ sleep, latency: aDuration(250), online: false });

    await network.enter();

    expect(requested).toEqual([]);
  });

  it('fails a request in flight when the connection drops before its latency has elapsed', async () => {
    let release: () => void = () => undefined;
    const network = new SimulatedNetwork({
      sleep: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      latency: aDuration(250),
    });

    const entering = network.enter();
    network.goOffline();
    release();

    expect(await entering).toStrictEqual(err(networkUnavailable()));
  });
});
