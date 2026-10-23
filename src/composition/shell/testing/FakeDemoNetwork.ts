import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import type { createFakes } from '@testing/application/createFakes';

import type { DemoNetwork } from '../services/AppServices';

// Test support, not production code: only tests import it (a lint rule enforces it).

/**
 * The switch of the demo over the fakes of a test: going offline cuts the fake remote sources and
 * tells the fake connectivity, as the simulated network of the mock configuration does for the
 * whole app, so a test of the offline scenario drives it the way the demo does.
 */
export class FakeDemoNetwork implements DemoNetwork {
  private isOnline = true;
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor(private readonly fakes: ReturnType<typeof createFakes>) {}

  get online(): boolean {
    return this.isOnline;
  }

  setOnline(online: boolean): void {
    if (online === this.isOnline) return;
    this.isOnline = online;
    if (online) this.fakes.network.goOnline();
    else this.fakes.network.goOffline();
    this.fakes.connectivity.emit(online ? CONNECTIVITY_STATUS.Online : CONNECTIVITY_STATUS.Offline);
    for (const listener of [...this.listeners]) listener(online);
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
