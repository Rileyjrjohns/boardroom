import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildCoverageTable, SCOPES, type CoverageSummary } from './coverageTable.mjs';

// The table of the coverage that the CI appends to the summary of a run (see ci.yml). The function
// is pure, and is given a summary written by hand in the format of the `json-summary` reporter of
// Jest; the entry that reads the real file is run on a copy of that summary.

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(__dirname, 'printCoverageTable.mjs');

/** One measure: `covered` of `total`, with the percentage Istanbul writes. */
const measure = (covered: number, total: number) => ({
  total,
  covered,
  skipped: 0,
  pct: total === 0 ? 100 : Math.round((covered / total) * 10000) / 100,
});

/** A file where the four measures have the same counts. */
const file = (covered: number, total: number) => ({
  statements: measure(covered, total),
  branches: measure(covered, total),
  functions: measure(covered, total),
  lines: measure(covered, total),
});

/** The summary of a repository where each layer has a figure of its own. */
const SUMMARY: CoverageSummary = {
  total: {
    statements: { total: 100, covered: 987, skipped: 0, pct: 98.7 },
    branches: { total: 100, covered: 943, skipped: 0, pct: 94.3 },
    functions: { total: 100, covered: 989, skipped: 0, pct: 98.9 },
    lines: { total: 100, covered: 994, skipped: 0, pct: 99.4 },
  },
  // Two files in the domain, whose counts are not the mean of their percentages: 2 of 4 is 50 %,
  // and the mean of 100 % and 33.33 % is 66.67 %.
  '/work/repo/src/features/meetings/domain/entities/Meeting.ts': file(1, 1),
  '/work/repo/src/features/votes/domain/entities/Vote.ts': file(1, 3),
  '/work/repo/src/features/votes/application/use-cases/CastVote.ts': file(9, 10),
  '/work/repo/src/core/infrastructure/http/HttpClient.ts': file(80, 100),
  '/work/repo/src/features/meetings/presentation/screens/MeetingsScreen.tsx': file(3, 4),
  '/work/repo/src/composition/container/createContainer.ts': file(7, 8),
  // A folder whose name starts like a layer, and a file outside src: in no row.
  '/work/repo/src/core/domain-extra/Other.ts': file(0, 50),
  '/work/repo/tooling/tool.ts': file(0, 50),
};

/** The labels of the rows of the layers, as the table writes them (the label in backticks). */
const DOMAIN = '`src/{core,features/*}/domain`';
const APPLICATION = '`src/{core,features/*}/application`';
const INFRASTRUCTURE = '`src/{core,features/*}/infrastructure`';
const PRESENTATION = '`src/{core,features/*}/presentation`';
const COMPOSITION = '`src/composition`';

const lines = (table: string): string[] => table.split('\n');

/** The cells of the row whose first cell is `label`. */
function rowOf(table: string, label: string): string[] {
  const row = lines(table).find((line) => line.startsWith(`| ${label} |`));
  if (row === undefined) throw new Error(`No row "${label}" in:\n${table}`);
  return row
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

describe('buildCoverageTable', () => {
  const table = buildCoverageTable(SUMMARY);

  it('is a title and a Markdown table, ended by a new line', () => {
    const [title, blank, header, alignment] = lines(table);

    expect(title).toBe('### Test coverage');
    expect(blank).toBe('');
    expect(header).toBe('| Scope | Statements | Branches | Functions | Lines | Gate |');
    expect(alignment).toBe('| --- | ---: | ---: | ---: | ---: | --- |');
    expect(table.endsWith('|\n')).toBe(true);
  });

  it('has the same number of cells on every line of the table', () => {
    const tableLines = lines(table).filter((line) => line.startsWith('|'));

    expect(tableLines).toHaveLength(2 + SCOPES.length);
    expect(new Set(tableLines.map((line) => line.split('|').length))).toEqual(new Set([8]));
  });

  it('has one row for the whole of src, then one per layer, in that order', () => {
    const labels = lines(table)
      .slice(4, -1)
      .map((line) => line.split('|')[1]?.trim());

    expect(labels).toEqual([
      'Total (src)',
      DOMAIN,
      APPLICATION,
      INFRASTRUCTURE,
      PRESENTATION,
      COMPOSITION,
    ]);
  });

  it('shows the total as the summary gives it, in percent with two decimals', () => {
    expect(rowOf(table, 'Total (src)')).toEqual([
      'Total (src)',
      '98.70 %',
      '94.30 %',
      '98.90 %',
      '99.40 %',
      '70 %',
    ]);
  });

  it('computes a layer from the counts of its files, not from the mean of their percentages', () => {
    expect(rowOf(table, DOMAIN)).toEqual([
      DOMAIN,
      '50.00 %',
      '50.00 %',
      '50.00 %',
      '50.00 %',
      '90 %',
    ]);
  });

  it('puts each file in its layer, and only in it', () => {
    expect(rowOf(table, APPLICATION).slice(1, 5)).toEqual(Array(4).fill('90.00 %'));
    expect(rowOf(table, INFRASTRUCTURE).slice(1, 5)).toEqual(Array(4).fill('80.00 %'));
    expect(rowOf(table, PRESENTATION).slice(1, 5)).toEqual(Array(4).fill('75.00 %'));
    expect(rowOf(table, COMPOSITION).slice(1, 5)).toEqual(Array(4).fill('87.50 %'));
  });

  it('gives the gate of each row: 70 for the total, 90 for domain and application, none for the others', () => {
    const gates = SCOPES.map(({ label, folders }) => {
      const cells = rowOf(table, folders === null ? label : `\`${label}\``);
      return cells[5];
    });

    expect(gates).toEqual(['70 %', '90 %', '90 %', 'none', 'none', 'none']);
  });

  it('cuts a figure to two decimals instead of rounding it, so that a layer under its gate never shows it', () => {
    const justUnder: CoverageSummary = {
      total: SUMMARY['total'] as CoverageSummary[string],
      '/work/repo/src/core/domain/Meeting.ts': file(89996, 100000),
      '/work/repo/src/features/votes/application/CastVote.ts': file(2, 3),
    };
    const underTable = buildCoverageTable(justUnder);

    expect(rowOf(underTable, DOMAIN).slice(1, 5)).toEqual(Array(4).fill('89.99 %'));
    expect(rowOf(underTable, APPLICATION).slice(1, 5)).toEqual(Array(4).fill('66.66 %'));
  });

  it('reads the Windows separators of the paths', () => {
    const windows: CoverageSummary = {
      total: SUMMARY['total'] as CoverageSummary[string],
      'C:\\work\\repo\\src\\core\\domain\\Meeting.ts': file(1, 4),
    };

    expect(rowOf(buildCoverageTable(windows), DOMAIN).slice(1, 5)).toEqual(
      Array(4).fill('25.00 %'),
    );
  });

  it('shows a dash for a layer with no file, and for a total with nothing to measure', () => {
    const empty: CoverageSummary = {
      total: {
        statements: { total: 0, covered: 0, skipped: 0, pct: 'Unknown' },
        branches: { total: 0, covered: 0, skipped: 0, pct: 'Unknown' },
        functions: { total: 0, covered: 0, skipped: 0, pct: 'Unknown' },
        lines: { total: 0, covered: 0, skipped: 0, pct: 'Unknown' },
      },
    };
    const emptyTable = buildCoverageTable(empty);

    expect(rowOf(emptyTable, 'Total (src)')).toEqual(['Total (src)', '-', '-', '-', '-', '70 %']);
    expect(rowOf(emptyTable, DOMAIN)).toEqual([DOMAIN, '-', '-', '-', '-', '90 %']);
  });

  it('refuses a summary that has no total', () => {
    expect(() => buildCoverageTable({})).toThrow('The coverage summary has no "total" entry.');
  });
});

describe('the gates of the table', () => {
  const { coverageThreshold } = jest.requireActual<{
    coverageThreshold: Record<string, Record<string, number>>;
  }>('../jest.config.js');

  const gateOf = (percent: number) => ({
    statements: percent,
    branches: percent,
    functions: percent,
    lines: percent,
  });

  /** The folders of a row, with `*` replaced by every feature that is on the disk. */
  const foldersOf = (folders: readonly string[]): string[] =>
    folders.flatMap((folder) =>
      folder.includes('*')
        ? fs
            .readdirSync(path.join(ROOT, folder.split('*')[0] ?? ''), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => folder.replace('*', entry.name))
        : [folder],
    );

  it.each(SCOPES.filter(({ folders }) => folders !== null))(
    'agree with coverageThreshold of jest.config.js for $label',
    ({ folders, gate }) => {
      const existing = foldersOf(folders ?? []).filter((folder) =>
        fs.existsSync(path.join(ROOT, folder)),
      );

      expect(existing.length).toBeGreaterThan(0);
      for (const folder of existing) {
        // A folder that has no source file yet has no gate: Jest would fail on a path it has no data for.
        const hasGate = coverageThreshold[`./${folder}/`] !== undefined;
        if (gate === null) expect(hasGate).toBe(false);
        else if (hasGate) expect(coverageThreshold[`./${folder}/`]).toEqual(gateOf(gate));
      }
      if (gate !== null) {
        expect(
          existing.filter((folder) => coverageThreshold[`./${folder}/`] !== undefined),
        ).not.toHaveLength(0);
      }
    },
  );

  it('agree with the global gate of jest.config.js for the total', () => {
    const total = SCOPES.find(({ folders }) => folders === null);

    expect(coverageThreshold['global']).toEqual(gateOf(total?.gate ?? NaN));
  });
});

describe('printCoverageTable.mjs', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-table-'));
  afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

  const run = (argument: string) =>
    spawnSync(process.execPath, [ENTRY, argument], { cwd: ROOT, encoding: 'utf8' });

  it('prints the table of the summary it is given', () => {
    const summaryPath = path.join(folder, 'coverage-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(SUMMARY));

    const result = run(summaryPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(buildCoverageTable(SUMMARY));
  });

  it('fails with a message, and prints nothing, when the summary is missing', () => {
    const result = run(path.join(folder, 'missing.json'));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Cannot build the coverage table from');
  });

  it('fails when the file is not a coverage summary', () => {
    const summaryPath = path.join(folder, 'not-a-summary.json');
    fs.writeFileSync(summaryPath, '{}');

    const result = run(summaryPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('The coverage summary has no "total" entry.');
  });
});
