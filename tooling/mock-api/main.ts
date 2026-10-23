import type { AddressInfo } from 'node:net';

import { DEMO_PASSWORD } from '@composition/dev/in-memory/seed';

import { createMockApiServer } from './server';

// `npm run mock:api`: serves the API of docs/api.md from the simulated server and its seed, for the
// app in its http configuration. Options: `--port <number>` (default 4000, or MOCK_API_PORT),
// `--host <name>` (default 127.0.0.1; use 0.0.0.0 to reach it from a phone on the same network) and
// `--latency <milliseconds>`.

const DEFAULT_PORT = 4000;
const PORT_VARIABLE = 'MOCK_API_PORT';
const DEFAULT_HOST = '127.0.0.1';
/** How the Android emulator names the computer it runs on. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';
const MAX_PORT = 65_535;

/** The value that follows `--name`, or `undefined`. */
function option(name: string): string | undefined {
  const position = process.argv.indexOf(`--${name}`);
  return position === -1 ? undefined : process.argv[position + 1];
}

function whole(text: string | undefined, name: string, max?: number): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || (max !== undefined && value > max)) {
    console.error(
      `${name} must be a whole number${max === undefined ? '' : ` up to ${max}`}, got "${text}".`,
    );
    process.exit(1);
  }
  return value;
}

const port =
  whole(option('port') ?? process.env[PORT_VARIABLE], 'The port', MAX_PORT) ?? DEFAULT_PORT;
const host = option('host') ?? DEFAULT_HOST;
const latencyMillis = whole(option('latency'), 'The latency');

const created = createMockApiServer({
  ...(latencyMillis === undefined ? {} : { latencyMillis }),
  onRequest: (line) => {
    console.log(line);
  },
});
if (!created.ok) {
  console.error(`The mock API cannot start: ${created.error.detail}.`);
  process.exit(1);
}

const { server, accounts } = created.value;
server.listen(port, host, () => {
  // The port the system gave, when `--port 0` asked it to pick one.
  const { port: bound } = server.address() as AddressInfo;
  console.log(`Boardroom mock API listening on http://${host}:${bound}`);
  console.log(`  iOS simulator:    EXPO_PUBLIC_BOARDROOM_API_BASE_URL=http://localhost:${bound}`);
  console.log(
    `  Android emulator: EXPO_PUBLIC_BOARDROOM_API_BASE_URL=http://${ANDROID_EMULATOR_HOST}:${bound}`,
  );
  console.log(`Accounts (password of the simulation, it protects nothing: ${DEMO_PASSWORD}):`);
  for (const { email } of accounts) console.log(`  ${email}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
