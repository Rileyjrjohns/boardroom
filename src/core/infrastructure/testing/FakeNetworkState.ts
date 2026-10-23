import type { NetworkSnapshot, NetworkStateApi } from '../connectivity/ExpoConnectivity';

// Test support, not production code: the state of the network as `expo-network` reports it, which
// a test changes and which tells its listeners, like the platform does.

export class FakeNetworkState implements NetworkStateApi {
  state: NetworkSnapshot = { isConnected: true, isInternetReachable: true };
  failure: Error | undefined;
  hanging = false;
  readonly listeners = new Set<(state: NetworkSnapshot) => void>();
  subscriptions = 0;

  getState(): Promise<NetworkSnapshot> {
    if (this.hanging) return new Promise(() => undefined);
    return this.failure === undefined ? Promise.resolve(this.state) : Promise.reject(this.failure);
  }

  subscribe(listener: (state: NetworkSnapshot) => void): () => void {
    this.subscriptions += 1;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The platform changes state and says so. */
  change(state: NetworkSnapshot): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}
