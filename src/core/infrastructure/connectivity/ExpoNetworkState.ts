import * as Network from 'expo-network';

import type { NetworkSnapshot, NetworkStateApi } from './ExpoConnectivity';

/**
 * The two calls of `expo-network` that the connectivity uses, handed over as they are. No logic of
 * its own, so Jest only checks that it asks the module the right questions (see the test), and the
 * events of the platform have been received on no device.
 */
export class ExpoNetworkState implements NetworkStateApi {
  getState(): Promise<NetworkSnapshot> {
    return Network.getNetworkStateAsync();
  }

  subscribe(listener: (state: NetworkSnapshot) => void): () => void {
    const subscription = Network.addNetworkStateListener(listener);
    return () => {
      subscription.remove();
    };
  }
}
