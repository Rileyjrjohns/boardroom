/**
 * Waits for a number of milliseconds. The only thing in the app that creates a timer for a delay
 * on purpose: the simulated network latency. It is a function handed to the code that needs it,
 * so the domain and the application stay free of timers, and a test replaces it with one that
 * does not wait (`src/core/infrastructure/testing/sleep.ts`).
 */
export type Sleep = (millis: number) => Promise<void>;

/** The real thing: resolves after `millis` milliseconds of the clock of the device. */
export const timerSleep: Sleep = (millis) =>
  new Promise((resolve) => {
    setTimeout(resolve, millis);
  });
