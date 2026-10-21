// Prints the coverage table in Markdown, from coverage/coverage-summary.json (written by
// `npm run test:coverage`). The CI appends the output to the summary of the run:
//
//   node tooling/printCoverageTable.mjs >> "$GITHUB_STEP_SUMMARY"
//
// The file to read can be given as the first argument. All the work is done by buildCoverageTable
// (tooling/coverageTable.mjs), which is tested; this is only the reading and the printing.

import fs from 'node:fs';
import path from 'node:path';

import { buildCoverageTable } from './coverageTable.mjs';

const DEFAULT_SUMMARY = path.resolve(
  import.meta.dirname,
  '..',
  'coverage',
  'coverage-summary.json',
);
const summaryPath = process.argv[2] ?? DEFAULT_SUMMARY;

try {
  process.stdout.write(buildCoverageTable(JSON.parse(fs.readFileSync(summaryPath, 'utf8'))));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Cannot build the coverage table from ${summaryPath}: ${reason}\n`);
  process.exitCode = 1;
}
