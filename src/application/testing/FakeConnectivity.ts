import { CONNECTIVITY_STATUS } from '../ports/Connectivity';
import type { Connectivity, ConnectivityStatus } from '../ports/Connectivity';
import type { Unsubscribe } from '../ports/ScreenProtection';

/** A device that is online until the test says otherwise. */
export class FakeConnectivity implements Connectivity {
  private status: ConnectivityStatus = CONNECTIVITY_STATUS.Online;
  private readonly listeners = new Set<(status: ConnectivityStatus) => void>();

  /** How many times `current` was asked. */
  currentCalls = 0;

  current(): Promise<ConnectivityStatus> {
    this.currentCalls += 1;
    return Promise.resolve(this.status);
  }

  subscribe(listener: (status: ConnectivityStatus) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The platform reports a status. Only a change is passed on, as the port promises. */
  emit(status: ConnectivityStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of [...this.listeners]) listener(status);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
