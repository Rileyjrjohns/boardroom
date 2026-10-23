import type { Sleep } from '../clock/sleep';

// Test support, not production code: a test never waits for a simulated latency. Only tests and
// other test support import it (a lint rule enforces it).

/** A sleep that does not wait: the simulated network answers as fast as the code runs. */
export const immediateSleep: Sleep = () => Promise.resolve();

/** A sleep that does not wait either, and remembers how long it was asked to wait. */
export function recordingSleep(): { readonly sleep: Sleep; readonly requested: number[] } {
  const requested: number[] = [];
  return {
    requested,
    sleep: (millis) => {
      requested.push(millis);
      return Promise.resolve();
    },
  };
}
