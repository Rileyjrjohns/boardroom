// Lints code snippets with the real ESLint configuration of the repository and prints the result
// as JSON. It reads `[{ "filePath": "...", "code": "..." }]` on the standard input and writes
// `[{ "filePath": "...", "messages": [{ "ruleId": "...", "message": "..." }] }]`.
//
// Used by tooling/lint-rules.test.ts, which checks what the configuration accepts and rejects. The
// file paths decide which rules apply (app/, the presentation folders, and so on); they need not exist.

import path from 'node:path';

import { ESLint } from 'eslint';

const ROOT = path.resolve(import.meta.dirname, '..');

process.stdin.setEncoding('utf8');
let input = '';
for await (const chunk of process.stdin) input += chunk;
const snippets = JSON.parse(input);

const eslint = new ESLint({ cwd: ROOT });
const results = [];
for (const { filePath, code } of snippets) {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, filePath) });
  results.push({
    filePath,
    messages: result.messages.map(({ ruleId, message, line }) => ({ ruleId, message, line })),
  });
}
process.stdout.write(JSON.stringify(results));
