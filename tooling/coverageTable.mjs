// Builds the Markdown table of the coverage that the CI shows on the page of a run. Pure: it takes
// the content of coverage/coverage-summary.json (the `json-summary` reporter of Jest, enabled in
// jest.config.js) and returns text, so that it can be tested without running Jest. The thin entry
// that reads the file and prints is tooling/printCoverageTable.mjs.

/**
 * One measure of a file, as the `json-summary` reporter writes it. `pct` is the string "Unknown"
 * when there is nothing to measure.
 * @typedef {{ total: number, covered: number, skipped: number, pct: number | string }} Measure
 */

/**
 * The four measures of one file, or of all the files together (the `total` entry).
 * @typedef {{ statements: Measure, branches: Measure, functions: Measure, lines: Measure }} Measures
 */

/**
 * The content of coverage-summary.json: a `total` entry, then one entry per file, keyed by its
 * absolute path.
 * @typedef {Record<string, Measures>} CoverageSummary
 */

/**
 * The gate of a row, in percent, applied to each of the four measures, or `null` for no gate. The
 * row covers `folders` (`*` is one folder name: every feature), or the whole of `src/` when
 * `folders` is `null`.
 * @typedef {{ label: string, folders: readonly string[] | null, gate: number | null }} Scope
 */

/**
 * The rows of the table, in order: the whole of `src/`, then the four layers of the core and of the
 * features put together, then the composition. The gates are the ones of jest.config.js
 * (`coverageThreshold`), which holds each domain and application folder to 90 on its own: a test
 * checks that the two agree. The 70 of the total is what Jest asks of the files that have no gate of
 * their own (infrastructure, presentation and the composition); the whole of `src/` is therefore
 * above it too.
 * @type {readonly Scope[]}
 */
export const SCOPES = [
  { label: 'Total (src)', folders: null, gate: 70 },
  {
    label: 'src/{core,features/*}/domain',
    folders: ['src/core/domain', 'src/features/*/domain'],
    gate: 90,
  },
  {
    label: 'src/{core,features/*}/application',
    folders: ['src/core/application', 'src/features/*/application'],
    gate: 90,
  },
  {
    label: 'src/{core,features/*}/infrastructure',
    folders: ['src/core/infrastructure', 'src/features/*/infrastructure'],
    gate: null,
  },
  {
    label: 'src/{core,features/*}/presentation',
    folders: ['src/core/presentation', 'src/features/*/presentation'],
    gate: null,
  },
  { label: 'src/composition', folders: ['src/composition'], gate: null },
];

/** The measures of the table, in the order of its columns. */
const MEASURES = /** @type {const} */ (['statements', 'branches', 'functions', 'lines']);

const TITLE = '### Test coverage';
const HEADER = ['Scope', 'Statements', 'Branches', 'Functions', 'Lines', 'Gate'];
const ALIGNMENT = ['---', '---:', '---:', '---:', '---:', '---'];
const NO_VALUE = '-';
const NO_GATE = 'none';
const DECIMALS = 2;
const SCALE = 10 ** DECIMALS;

/**
 * A percentage as the table shows it: "98.70 %".
 * @param {number} percent
 */
const formatPercent = (percent) => `${percent.toFixed(DECIMALS)} %`;

/**
 * Whether the file is under the folder (`src/core/domain`). A `*` in the folder stands for any one
 * folder name, which is how the folders of the features are written. Windows separators are
 * accepted, and `src/core/domain` does not match `src/core/domainish/`.
 * @param {string} file
 * @param {string} folder
 */
function isUnder(file, folder) {
  const normalised = file.replaceAll('\\', '/');
  const pattern = folder
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  return new RegExp(`(?:^|/)${pattern}/`).test(normalised);
}

/**
 * The percentage covered of the files of a layer, from their counts: the figure of the layer is
 * the sum of what is covered over the sum of what there is, not the mean of the files' figures.
 * It is cut to two decimals, not rounded, as Istanbul does for the figures of Jest: a layer that
 * is under its gate never shows the gate (89.996 is 89.99, not 90.00). `null` when the layer has
 * nothing to measure (no file, or no statement).
 * @param {Measures[]} files
 * @param {(typeof MEASURES)[number]} measure
 * @returns {number | null}
 */
function percentOf(files, measure) {
  const total = files.reduce((sum, file) => sum + file[measure].total, 0);
  const covered = files.reduce((sum, file) => sum + file[measure].covered, 0);
  return total === 0 ? null : Math.floor((covered * 100 * SCALE) / total) / SCALE;
}

/**
 * The percentage of the `total` entry, which Istanbul writes as "Unknown" when it has nothing to
 * measure.
 * @param {Measures} total
 * @param {(typeof MEASURES)[number]} measure
 * @returns {number | null}
 */
function percentOfTotal(total, measure) {
  const { pct } = total[measure];
  return typeof pct === 'number' ? pct : null;
}

/**
 * @param {readonly string[]} cells
 */
const toRow = (cells) => `| ${cells.join(' | ')} |`;

/**
 * The Markdown of the coverage table: a title, then one row for the whole of `src/` and one per
 * layer, with the four measures in percent and the gate of the row.
 * @param {CoverageSummary} summary The content of coverage/coverage-summary.json.
 * @returns {string}
 */
export function buildCoverageTable(summary) {
  const { total, ...byFile } = summary;
  if (total === undefined) {
    throw new Error('The coverage summary has no "total" entry.');
  }
  const files = Object.entries(byFile);

  const rows = SCOPES.map(({ label, folders, gate }) => {
    const percents = MEASURES.map((measure) => {
      if (folders === null) return percentOfTotal(total, measure);
      return percentOf(
        files
          .filter(([file]) => folders.some((folder) => isUnder(file, folder)))
          .map(([, measures]) => measures),
        measure,
      );
    });
    return toRow([
      folders === null ? label : `\`${label}\``,
      ...percents.map((percent) => (percent === null ? NO_VALUE : formatPercent(percent))),
      gate === null ? NO_GATE : `${gate} %`,
    ]);
  });

  return [TITLE, '', toRow(HEADER), toRow(ALIGNMENT), ...rows, ''].join('\n');
}
