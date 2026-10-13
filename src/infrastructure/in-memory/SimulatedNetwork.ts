import { networkUnavailable } from '@domain/errors/RepositoryError';
import type { NetworkUnavailableError } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Duration } from '@domain/value-objects/Duration';

import type { Sleep } from '../clock/sleep';

/**
 * The longest a request is made to wait, whatever latency is configured. Every port settles in
 * bounded time, so a simulated server may be slow but never stuck.
 */
export const MAX_SIMULATED_LATENCY_MILLIS = 10_000;

/** What the demo and the end-to-end tests drive: the connectivity of the simulated server. */
export interface NetworkControl {
  readonly online: boolean;
  /** How long a request takes to be answered, as configured (it is capped when applied). */
  readonly latency: Duration;
  goOnline(): void;
  goOffline(): void;
  setOnline(online: boolean): void;
  setLatency(latency: Duration): void;
}

export interface SimulatedNetworkOptions {
  /** How the latency is waited for. The tests give one that does not wait. */
  readonly sleep: Sleep;
  readonly latency: Duration;
  /** Connected unless said otherwise. */
  readonly online?: boolean;
}

/**
 * The connectivity of the simulated server: on or off, and how long it takes to answer. It belongs
 * to the server side of the simulation: the backend exposes it, and every client of that server
 * (the three repositories, the sign-in) enters the network through it, so that going offline
 * cuts all of them at once and deterministically.
 *
 * Going offline fails a request at once, like a device that knows it has no connection. A request
 * in flight when the connection drops fails too, when its latency has elapsed.
 */
export class SimulatedNetwork implements NetworkControl {
  private isOnline: boolean;
  private currentLatency: Duration;
  private readonly sleep: Sleep;

  constructor(options: SimulatedNetworkOptions) {
    this.isOnline = options.online ?? true;
    this.currentLatency = options.latency;
    this.sleep = options.sleep;
  }

  get online(): boolean {
    return this.isOnline;
  }

  get latency(): Duration {
    return this.currentLatency;
  }

  goOnline(): void {
    this.isOnline = true;
  }

  goOffline(): void {
    this.isOnline = false;
  }

  setOnline(online: boolean): void {
    this.isOnline = online;
  }

  setLatency(latency: Duration): void {
    this.currentLatency = latency;
  }

  /**
   * A client's request reaching the server: `networkUnavailable` when there is no connection, now
   * or by the time the latency has elapsed; success otherwise.
   */
  async enter(): Promise<Result<void, NetworkUnavailableError>> {
    if (!this.isOnline) return err(networkUnavailable());
    await this.sleep(Math.min(this.currentLatency, MAX_SIMULATED_LATENCY_MILLIS));
    return this.isOnline ? ok(undefined) : err(networkUnavailable());
  }
}
