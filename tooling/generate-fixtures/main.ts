import fs from 'node:fs';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';

import { parseInstant } from '@domain/value-objects/Instant';
import { toMeetingWire } from '@infrastructure/http/dto/meetingDto';
import { toVoteRequestWire } from '@infrastructure/http/dto/voteDto';
import { toIsoString } from '@infrastructure/http/dto/wire';
import { loadFixtures } from '@infrastructure/in-memory/fixtures/loadFixtures';

import { buildSeed } from './buildSeed';

// How the fixtures of docs/spec/fixtures were made: the generator that used to be the seed of the
// simulated server is run once, at the reference date below, and its content is written in the
// format of the HTTP API (docs/api.md). Run it with
//
//   node --experimental-transform-types --disable-warning=ExperimentalWarning \
//     --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./tooling/mock-api/register.mjs \
//     tooling/generate-fixtures/main.ts [output folder]
//
// The fixtures are the source of truth, not this script: it exists to say how they were made, and
// running it again overwrites them, hand edits included. Two runs give the same bytes.
//
// What it writes is read back through the loader of the app before anything is saved, so that a
// generation that breaks a rule of the fixtures (among them the margin of a day around the reference
// date that the whole-day shift relies on) fails here instead of being committed.

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'docs', 'spec', 'fixtures');

/** The instant every date of the fixtures is relative to. A fixed instant, never the clock. */
export const REFERENCE_DATE = '2026-10-01T08:00:00.000Z';

const INDENT = 2;

/**
 * The value with the keys of every object in alphabetical order. The order of the keys carries no
 * meaning, so it is fixed to make the files stable; the order of a list does, and is kept.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
      .map(([key, member]) => [key, sortKeys(member)]),
  );
}

/** `referenceDate` first, so that it is the first thing a reader meets, then the content. */
async function render(content: Record<string, unknown>): Promise<string> {
  const text = JSON.stringify(
    { referenceDate: REFERENCE_DATE, ...(sortKeys(content) as object) },
    null,
    INDENT,
  );
  const config = (await resolveConfig(path.join(ROOT, 'package.json'))) ?? {};
  return format(text, { ...config, parser: 'json' });
}

const parsedReference = parseInstant(Date.parse(REFERENCE_DATE));
if (!parsedReference.ok) throw new Error('The reference date is not an instant.');
const seed = buildSeed(parsedReference.value);
if (!seed.ok) throw new Error(`The seed is invalid: ${seed.error.detail}`);
const { accounts, demoUser, content } = seed.value;

const files: Record<string, Record<string, unknown>> = {
  'accounts.json': {
    accounts: accounts.map(({ user, password }) => ({
      password,
      user: { email: user.email, fullName: user.fullName, id: user.id },
    })),
    demoUserId: demoUser.id,
  },
  'meetings.json': { meetings: content.meetings.map(toMeetingWire) },
  'recorded-votes.json': { recordedVotes: content.recordedVotes.map(toVoteRequestWire) },
};

const rendered = new Map<string, string>();
for (const [name, fileContent] of Object.entries(files)) {
  rendered.set(name, await render(fileContent));
}

const reread = (name: string): unknown => JSON.parse(rendered.get(name) ?? '') as unknown;
const loaded = loadFixtures(
  {
    accounts: reread('accounts.json'),
    meetings: reread('meetings.json'),
    recordedVotes: reread('recorded-votes.json'),
  },
  parsedReference.value,
);
if (!loaded.ok) throw new Error(`The fixtures are not loadable: ${loaded.error.detail}`);

const output = process.argv[2] ?? DEFAULT_OUTPUT;
fs.mkdirSync(output, { recursive: true });
for (const [name, text] of rendered) {
  fs.writeFileSync(path.join(output, name), text);
  console.log(`${name}`);
}
console.log(`Reference date: ${toIsoString(parsedReference.value)}`);
