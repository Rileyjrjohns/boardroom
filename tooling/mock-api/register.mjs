// Lets Node run the TypeScript sources of the app directly, with no dependency and no build, for
// `npm run mock:api`. Node 24 strips the types itself; what it does not do is resolve the
// `@core/*`-style aliases of tsconfig.json and the extensionless imports of the sources, which is
// all this hook adds. It is loaded with `node --import ./tooling/mock-api/register.mjs`.
//
// The aliases are read from tsconfig.json, their single source of truth: TypeScript, Metro, ESLint
// and Jest read the same file. It is plain JSON, with no comment, for the same reason as in
// jest.config.js.

import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** What a TypeScript source can be called when it is imported without its extension. */
const CANDIDATES = ['.ts', '/index.ts'];

/** @type {Record<string, string[]>} */
const paths = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8')).compilerOptions
  .paths;

/** `@core/` and the folder it stands for, for every alias of tsconfig.json. */
const aliases = Object.entries(paths).map(([alias, [target]]) => [
  alias.replace(/\*$/, ''),
  path.join(ROOT, (target ?? '').replace(/\*$/, '')),
]);

/**
 * The file a path without an extension stands for, or `undefined`.
 * @param {string} base
 */
function sourceFile(base) {
  for (const suffix of CANDIDATES) {
    if (fs.existsSync(`${base}${suffix}`)) return `${base}${suffix}`;
  }
  return fs.existsSync(base) && fs.statSync(base).isFile() ? base : undefined;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const [prefix, folder] of aliases) {
      if (!specifier.startsWith(prefix)) continue;
      const file = sourceFile(path.join(folder, specifier.slice(prefix.length)));
      if (file !== undefined) return nextResolve(pathToFileURL(file).href, context);
    }

    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && context.parentURL?.startsWith('file:')) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      const file = fs.existsSync(base) && fs.statSync(base).isFile() ? undefined : sourceFile(base);
      if (file !== undefined) return nextResolve(pathToFileURL(file).href, context);
    }

    return nextResolve(specifier, context);
  },
});
