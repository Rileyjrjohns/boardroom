import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import type { ConnectivityStatus } from '@application/ports/Connectivity';
import { describeConnectivityContract } from '@application/testing/contracts/connectivityContract';
import { aDuration } from '@domain/testing/builders';

import { SimulatedNetwork } from '../in-memory/SimulatedNetwork';
import { immediateSleep } from '../testing/sleep';

import { SimulatedConnectivity } from './SimulatedConnectivity';

function aNetwork() {
  return new SimulatedNetwork({ sleep: immediateSleep, latency: aDuration(0) });
}

describeConnectivityContract('SimulatedConnectivity', () => {
  const network = aNetwork();
  return {
    connectivity: new SimulatedConnectivity(network),
    report: (status) => network.setOnline(status === CONNECTIVITY_STATUS.Online),
  };
});

describe('SimulatedConnectivity', () => {
  it('follows the switch of the simulated server, whoever turns it', async () => {
    const network = aNetwork();
    const connectivity = new SimulatedConnectivity(network);
    const received: ConnectivityStatus[] = [];
    connectivity.subscribe((status) => received.push(status));

    network.setOnline(false);

    expect(await connectivity.current()).toBe(CONNECTIVITY_STATUS.Offline);
    expect(received).toEqual([CONNECTIVITY_STATUS.Offline]);
  });
});
