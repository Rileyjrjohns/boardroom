import fs from 'node:fs';
import path from 'node:path';

import { en } from '../src/core/presentation/i18n/resources/en';
import * as tokens from '../src/core/presentation/theme/tokens';

// Things the presentation layer declares for its screens to use: design tokens and translation
// keys. One that no screen uses is dead weight that the documentation would have to explain, so it
// is removed. The screens are in the presentation folders of the core and of every feature, in the
// app shell (src/composition/shell) and in the routes (app/). These tests read the sources, which is
// why they live with the tooling.

const ROOT = path.resolve(__dirname, '..');
const FEATURES_FOLDER = path.join('src', 'features');

/** The presentation folders of the core and of every feature, the app shell and the routes. */
function sourceFolders(): string[] {
  const features = fs
    .readdirSync(path.join(ROOT, FEATURES_FOLDER), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(FEATURES_FOLDER, entry.name, 'presentation'));
  return [
    'app',
    path.join('src', 'core', 'presentation'),
    ...features,
    path.join('src', 'composition', 'shell'),
  ].filter((folder) => fs.existsSync(path.join(ROOT, folder)));
}

const SOURCE_FOLDERS = sourceFolders();
const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const TEST_SUPPORT_FOLDER = `${path.sep}testing${path.sep}`;
const TOKENS_FILE = path.join('theme', 'tokens.ts');
const RESOURCES_FOLDER = path.join('i18n', 'resources');
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function filesUnder(folder: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, folder), { recursive: true, encoding: 'utf8' })
    .filter((file) => SOURCE_FILE.test(file))
    .map((file) => path.join(folder, file));
}

/** The text of the code the app ships: not the tests, nor the test support. */
const productionSources = SOURCE_FOLDERS.flatMap(filesUnder).filter(
  (file) =>
    !TEST_FILE.test(file) &&
    !file.includes(TEST_SUPPORT_FOLDER) &&
    !file.endsWith(TOKENS_FILE) &&
    !file.includes(RESOURCES_FOLDER),
);
const code = productionSources
  .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
  .join('\n');

/** Flattens a resource to the keys `t` is called with: plural forms are one key. */
function keysOf(resource: object, prefix = ''): string[] {
  return Object.entries(resource).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'string'
      ? [path.replace(PLURAL_SUFFIX, '')]
      : keysOf(value as object, path);
  });
}

describe('the design tokens', () => {
  const entries = Object.entries(tokens).flatMap(([group, value]) =>
    typeof value === 'object'
      ? Object.keys(value as object).map((key) => `${group}.${key}`)
      : [group],
  );

  it('has some', () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it.each(entries)('is used by the code: %s', (token) => {
    const pattern = new RegExp(`\\b${token.replace('.', '\\.')}\\b`);

    expect(code).toMatch(pattern);
  });
});

describe('the translation keys', () => {
  const keys = [...new Set(keysOf(en))];

  it.each(keys)('is used by the code: %s', (key) => {
    expect(code).toContain(`'${key}'`);
  });
});
