import { spawn } from 'node:child_process';
import path from 'node:path';

// `npm run mock:api` as it is run: a Node process that strips the types of the TypeScript sources
// and resolves their aliases through tooling/mock-api/register.mjs, with no dependency and no
// build. The in-process test (server.test.ts) cannot say that this works; this one starts the real
// command on a port the system picks, asks it something, and stops it.

const ROOT = path.resolve(__dirname, '..', '..');
const { scripts } = require('../../package.json') as { scripts: Record<string, string> };
const SCRIPT = scripts['mock:api'] ?? '';

const STARTUP_TIMEOUT_MILLIS = 20_000;

/** The command of the `mock:api` script, split into the arguments of `node`. */
function nodeArguments(extra: string[]): string[] {
  const [command, ...rest] = SCRIPT.split(' ');
  if (command !== 'node') throw new Error('The mock:api script no longer starts with node.');
  return [...rest, ...extra];
}

describe('npm run mock:api', () => {
  it('starts from the TypeScript sources, answers a request, and stops on SIGTERM', async () => {
    const child = spawn(process.execPath, nodeArguments(['--port', '0', '--latency', '0']), {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stopped = new Promise<number | null>((resolve) =>
      child.on('exit', (code) => resolve(code)),
    );
    let output = '';
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()));

    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`The mock API did not start.\n${output}\n${errors}`)),
          STARTUP_TIMEOUT_MILLIS,
        );
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          const match = /listening on (http:\/\/\S+)/.exec(output);
          if (match?.[1] !== undefined) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child.on('exit', () => reject(new Error(`The mock API stopped.\n${output}\n${errors}`)));
      });

      const signedIn = await fetch(`${url}/auth/sign-in`, {
        method: 'POST',
        body: JSON.stringify({
          email: 'alice.martin@boardroom.example',
          password: 'boardroom-demo',
        }),
      });
      const body = (await signedIn.json()) as { accessToken: string; tokenType: string };
      const listed = await fetch(`${url}/meetings?period=upcoming&limit=1`, {
        headers: { Authorization: `Bearer ${body.accessToken}` },
      });

      expect(signedIn.status).toBe(200);
      expect(body.tokenType).toBe('Bearer');
      expect(listed.status).toBe(200);
      expect(((await listed.json()) as { items: unknown[] }).items).toHaveLength(1);
      expect(output).toContain('10.0.2.2');
      expect(output).toContain('alice.martin@boardroom.example');
      expect(errors).toBe('');
    } finally {
      child.kill('SIGTERM');
    }

    expect(await stopped).toBe(0);
  }, 40_000);

  it('refuses a port that is not a port, and says why', async () => {
    const child = spawn(process.execPath, nodeArguments(['--port', '70000']), {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()));

    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));

    expect(code).toBe(1);
    expect(errors).toContain('The port must be a whole number up to 65535');
  }, 20_000);
});
