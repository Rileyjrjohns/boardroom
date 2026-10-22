import type { Connectivity, ConnectivityStatus } from '../../ports/Connectivity';
import type { Unsubscribe } from '../../ports/types/Unsubscribe';

export interface ObserveConnectivityDeps {
  readonly connectivity: Connectivity;
}

/** Where the connection stands now, and how to stop hearing about its changes. */
export interface ConnectivityObservation {
  /** The status when the observation started, including any change that came while it started. */
  readonly status: ConnectivityStatus;
  readonly unsubscribe: Unsubscribe;
}

/**
 * Watches the connectivity of the device. The caller gets the status at the start, then each later
 * change through `onChange`, and stops with `unsubscribe`. It needs no session: the sign-in screen
 * is as interested in being offline as the meetings are.
 *
 * The subscription starts before the status is read, so that a change that happens in between is
 * not missed: it replaces the status read, which is older. Only a change is reported, a status
 * that repeats is not, whatever the adapter does. The application does not decide what a change
 * means: the presentation shows it and calls `SyncPendingVotes` when the connection comes back.
 */
export class ObserveConnectivity {
  constructor(private readonly deps: ObserveConnectivityDeps) {}

  async execute(onChange: (status: ConnectivityStatus) => void): Promise<ConnectivityObservation> {
    const { connectivity } = this.deps;
    let latest: ConnectivityStatus | undefined;
    let starting = true;
    let active = true;

    const stopListening = connectivity.subscribe((status) => {
      if (!active || status === latest) return;
      latest = status;
      if (!starting) onChange(status);
    });

    const read = await connectivity.current();
    latest ??= read;
    starting = false;

    return {
      status: latest,
      unsubscribe: () => {
        if (!active) return;
        active = false;
        stopListening();
      },
    };
  }
}
