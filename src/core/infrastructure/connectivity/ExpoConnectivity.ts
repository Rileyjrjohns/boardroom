import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import type { Connectivity, ConnectivityStatus } from '@core/application/ports/Connectivity';
import { MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import type { Unsubscribe } from '@core/application/ports/types/Unsubscribe';
import { unexpected } from '@core/domain/errors/RepositoryError';

import { attempt, describeFailure } from '../shared/attempt';
import { createSubscribers } from '../shared/subscribers';

/** How long the platform may take to say where the connection stands. */
const DEFAULT_NETWORK_STATE_TIMEOUT_MILLIS = 5_000;

/** What the platform says about the connection: the two flags of `expo-network` that matter. */
export interface NetworkSnapshot {
  readonly isConnected?: boolean | undefined;
  readonly isInternetReachable?: boolean | undefined;
}

/** What the adapter asks of the platform. */
export interface NetworkStateApi {
  getState(): Promise<NetworkSnapshot>;
  /** Calls the listener with the new state at each change. Returns the function that stops it. */
  subscribe(listener: (state: NetworkSnapshot) => void): () => void;
}

/**
 * `offline` when the platform says the device is not connected, or is connected to a network that
 * does not reach the internet. A flag the platform does not set (`undefined`, which is how some
 * devices answer at the start) says nothing, and so is not a reason to call the device offline:
 * the port promises `online` when the platform cannot say.
 */
export function statusOf(state: NetworkSnapshot): ConnectivityStatus {
  return state.isConnected === false || state.isInternetReachable === false
    ? CONNECTIVITY_STATUS.Offline
    : CONNECTIVITY_STATUS.Online;
}

export interface ExpoConnectivityOptions {
  readonly api: NetworkStateApi;
  /** Told when a listener throws, which it must not. */
  readonly monitoring: Monitoring;
  /** Defaults to `DEFAULT_NETWORK_STATE_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/**
 * The connectivity of the device, over `expo-network`. It listens to the platform once, however
 * many subscribers there are, and only while there is one. It tells its subscribers about changes
 * of the status, not about each report of the platform, which repeats itself: the starting point is
 * read when the first subscriber arrives, and a report that says what is already known is dropped.
 * A platform that cannot be asked is `online` (see the port).
 *
 * Every call of `subscribe` is a subscription of its own, even for the same function, and a
 * listener that throws is captured by the monitoring and does not stop the others from hearing the
 * change (`createSubscribers`).
 */
export class ExpoConnectivity implements Connectivity {
  private readonly subscribers = createSubscribers<ConnectivityStatus>((error) => {
    this.options.monitoring.captureError(
      MONITORING_EVENT.ConnectivityListenerFailed,
      unexpected(describeFailure(error)),
    );
  });
  private known: ConnectivityStatus | undefined;
  private stopListening: (() => void) | undefined;
  /** Settles when the starting point is known. Never rejects. */
  private priming: Promise<void> = Promise.resolve();

  constructor(private readonly options: ExpoConnectivityOptions) {}

  async current(): Promise<ConnectivityStatus> {
    const state = await attempt(
      () => this.options.api.getState(),
      this.options.timeoutMillis ?? DEFAULT_NETWORK_STATE_TIMEOUT_MILLIS,
    );
    return state.ok ? statusOf(state.value) : CONNECTIVITY_STATUS.Online;
  }

  subscribe(listener: (status: ConnectivityStatus) => void): Unsubscribe {
    const stopSubscription = this.subscribers.subscribe(listener);
    if (this.stopListening === undefined) this.start();

    return () => {
      stopSubscription();
      if (this.subscribers.size === 0) this.stop();
    };
  }

  private start(): void {
    this.priming = this.current().then((status) => {
      this.known ??= status;
    });
    // The platform is listened to at once, so that no change is missed while the starting point
    // is being read; a report waits for it, to know whether it is a change.
    this.stopListening = this.options.api.subscribe((state) => {
      const status = statusOf(state);
      void this.priming.then(() => {
        this.report(status);
      });
    });
  }

  private stop(): void {
    this.stopListening?.();
    this.stopListening = undefined;
    this.known = undefined;
  }

  private report(status: ConnectivityStatus): void {
    if (this.stopListening === undefined || status === this.known) return;
    this.known = status;
    this.subscribers.notify(status);
  }
}
