import { networkUnavailable } from '@core/domain/errors/RepositoryError';
import type { NetworkUnavailableError } from '@core/domain/errors/RepositoryError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Duration } from '@core/domain/value-objects/Duration';
import type { Sleep } from '@core/infrastructure/clock/sleep';
import { createSubscribers } from '@core/infrastructure/shared/subscribers';

/**
 * The longest a request is made to wait, whatever latency is configured. Every port settles in
 * bounded time, so a simulated server may be slow but never stuck: a latency above the cap is a
 * request that times out, and fails with `networkUnavailable` once the cap has elapsed.
 */
export const MAX_SIMULATED_LATENCY_MILLIS = 10_000;

/** What the demo and the end-to-end tests drive: the connectivity of the simulated server. */
export interface NetworkControl {
  readonly online: boolean;
  /** How long a request takes to be answered, as configured. */
  readonly latency: Duration;
  setOnline(online: boolean): void;
  setLatency(latency: Duration): void;
  /** Calls the listener each time the connection goes off or comes back. Returns the function that stops it. */
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface SimulatedNetworkOptions {
  /** How the latency is waited for. The tests give one that does not wait. */
  readonly sleep: Sleep;
  readonly latency: Duration;
}

/**
 * The connectivity of the simulated server: on or off, and how long it takes to answer. It belongs
 * to the server side of the simulation: the backend exposes it, and every client of that server
 * (the three repositories, the sign-in) enters the network through it, so that going offline cuts
 * them all at once and deterministically. It starts online.
 *
 * Going offline fails a request at once, like a device that knows it has no connection. A request
 * in flight when the connection drops fails too, when its latency has elapsed. A latency above
 * `MAX_SIMULATED_LATENCY_MILLIS` is a timeout, and a `Sleep` that throws or rejects is a network
 * that failed: both answer `networkUnavailable`, nothing escapes the port.
 */
export class SimulatedNetwork implements NetworkControl {
  private isOnline = true;
  private currentLatency: Duration;
  // A listener that throws is its own bug: the simulation goes on, and the others are told.
  private readonly subscribers = createSubscribers<boolean>(() => undefined);
  private readonly sleep: Sleep;

  constructor(options: SimulatedNetworkOptions) {
    this.currentLatency = options.latency;
    this.sleep = options.sleep;
  }

  get online(): boolean {
    return this.isOnline;
  }

  get latency(): Duration {
    return this.currentLatency;
  }

  setOnline(online: boolean): void {
    if (online === this.isOnline) return;
    this.isOnline = online;
    this.subscribers.notify(online);
  }

  subscribe(listener: (online: boolean) => void): () => void {
    return this.subscribers.subscribe(listener);
  }

  setLatency(latency: Duration): void {
    this.currentLatency = latency;
  }

  /**
   * A client's request reaching the server: `networkUnavailable` when there is no connection, now
   * or by the time the latency has elapsed, when the latency is a timeout, or when waiting failed;
   * success otherwise.
   */
  async enter(): Promise<Result<void, NetworkUnavailableError>> {
    if (!this.isOnline) return err(networkUnavailable());
    try {
      await this.sleep(Math.min(this.currentLatency, MAX_SIMULATED_LATENCY_MILLIS));
    } catch {
      return err(networkUnavailable());
    }
    const timedOut = this.currentLatency > MAX_SIMULATED_LATENCY_MILLIS;
    return this.isOnline && !timedOut ? ok(undefined) : err(networkUnavailable());
  }
}
