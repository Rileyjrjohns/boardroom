import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import type { Connectivity, ConnectivityStatus } from '@core/application/ports/Connectivity';
import type { Unsubscribe } from '@core/application/ports/types/Unsubscribe';

import type { NetworkControl } from './SimulatedNetwork';

const statusOf = (online: boolean): ConnectivityStatus =>
  online ? CONNECTIVITY_STATUS.Online : CONNECTIVITY_STATUS.Offline;

/**
 * The connectivity of the mock configuration: the device is online when the simulated server is
 * reachable. It listens to the same switch the three repositories and the sign-in go through, so
 * that the offline switch of the demo drives the whole app, the banner and the sync included, with
 * nothing native and nothing random.
 */
export class SimulatedConnectivity implements Connectivity {
  constructor(private readonly network: Pick<NetworkControl, 'online' | 'subscribe'>) {}

  current(): Promise<ConnectivityStatus> {
    return Promise.resolve(statusOf(this.network.online));
  }

  subscribe(listener: (status: ConnectivityStatus) => void): Unsubscribe {
    return this.network.subscribe((online) => {
      listener(statusOf(online));
    });
  }
}
