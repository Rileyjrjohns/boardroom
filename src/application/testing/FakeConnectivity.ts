import { CONNECTIVITY_STATUS } from '../ports/Connectivity';
import type { Connectivity, ConnectivityStatus } from '../ports/Connectivity';
import type { Unsubscribe } from '../ports/ScreenProtection';

/** A device that is online until the test says otherwise. */
export class FakeConnectivity implements Connectivity {
  private status: ConnectivityStatus = CONNECTIVITY_STATUS.Online;
  // Each subscription is an object of its own, so the same function can subscribe twice.
  private readonly subscriptions = new Set<{
    readonly listener: (status: ConnectivityStatus) => void;
  }>();

  /** How many times `current` was asked. */
  currentCalls = 0;

  current(): Promise<ConnectivityStatus> {
    this.currentCalls += 1;
    return Promise.resolve(this.status);
  }

  subscribe(listener: (status: ConnectivityStatus) => void): Unsubscribe {
    const subscription = { listener };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /** The platform reports a status. Only a change is passed on, as the port promises. */
  emit(status: ConnectivityStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const { listener } of [...this.subscriptions]) {
      try {
        listener(status);
      } catch {
        // A listener that throws does not stop the others hearing the change: the port says so.
      }
    }
  }

  get listenerCount(): number {
    return this.subscriptions.size;
  }
}
