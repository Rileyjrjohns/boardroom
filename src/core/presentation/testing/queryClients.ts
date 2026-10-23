import type { QueryClient } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react-native';

// Test support, not production code: only tests import it (a lint rule enforces it).

// A query client keeps a timer for each query it holds, which would keep the test process alive.
// A client given to `trackClient` is emptied when the test ends. The screen is left first, and its
// effects are given the time to run, because a query that loses its last observer schedules its
// collection again: emptying the client before would leave that timer behind. The timer used to
// wait is the real one, taken before a test can replace it with a fake one.
const realSetTimeout = globalThis.setTimeout;
const tracked: QueryClient[] = [];

/** Has the client emptied at the end of the test. Returns it. */
export function trackClient<Client extends QueryClient>(client: Client): Client {
  tracked.push(client);
  return client;
}

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => {
    realSetTimeout(resolve, 0);
  });
  tracked.splice(0).forEach((client) => {
    client.clear();
  });
});
