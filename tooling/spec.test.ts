import fs from 'node:fs';
import path from 'node:path';

import { createAgendaItem } from '../src/domain/entities/AgendaItem';
import { CONFIDENTIALITY_LEVEL, createDocument } from '../src/domain/entities/Document';
import { createMeetingSummary } from '../src/domain/entities/MeetingSummary';
import { PARTICIPANT_ROLE, createParticipant } from '../src/domain/entities/Participant';
import { RESOLUTION_STATUS, createResolution } from '../src/domain/entities/Resolution';
import { createUser } from '../src/domain/entities/User';
import { createVote } from '../src/domain/entities/Vote';
import { restorePendingVote } from '../src/domain/entities/OutboxVote';
import { durationFromMillis } from '../src/domain/value-objects/Duration';
import { parseEmailAddress } from '../src/domain/value-objects/EmailAddress';
import {
  parseAgendaItemId,
  parseDocumentId,
  parseMeetingId,
  parseResolutionId,
  parseUserId,
} from '../src/domain/value-objects/ids';
import { parseInstant } from '../src/domain/value-objects/Instant';
import { parseDocumentLocation } from '../src/domain/value-objects/DocumentLocation';
import { parsePageCursor } from '../src/domain/value-objects/PageCursor';
import { createPageRequest } from '../src/domain/value-objects/PageRequest';
import { VOTE_CHOICE } from '../src/domain/value-objects/VoteChoice';
import { ROUTES, ROUTE_PARAMS } from '../src/presentation/navigation/routes';
import * as testIds from '../src/presentation/testIds';

import {
  ROOT,
  enumerationsIn,
  loadModule,
  parametersOfRoute,
  portsIn,
  routesOfApp,
  sourceFilesUnder,
  useCaseNamesIn,
} from './specCode';
import {
  TABLE_KIND,
  allCodes,
  firstCode,
  identifiersOf,
  parseSpecText,
  readSpecFile,
  sectionLines,
  slugOf,
  splitRow,
  tablesOfKind,
} from './specMarkdown';
import type { SpecDocument, Table } from './specMarkdown';

// The conformance test of the specification (docs/spec). The code follows the spec exactly, and
// this test fails when they diverge, in both directions: everything in the code is in the spec, and
// everything in the spec is in the code. How the files are read is documented in
// docs/spec/README.md ("Conformance conventions"); `specMarkdown.ts` reads the Markdown and
// `specCode.ts` reads the code.

const SPEC = path.join(ROOT, 'docs', 'spec');
const spec = {
  readme: readSpecFile(path.join(SPEC, 'README.md')),
  domain: readSpecFile(path.join(SPEC, 'domain.md')),
  useCases: readSpecFile(path.join(SPEC, 'use-cases.md')),
  ports: readSpecFile(path.join(SPEC, 'ports.md')),
  screens: readSpecFile(path.join(SPEC, 'screens.md')),
};
const SPEC_FILES: readonly SpecDocument[] = Object.values(spec);

/** Fails with the two lists that differ, instead of a bare "not equal". */
function expectSameSet(inCode: readonly string[], inSpec: readonly string[]): void {
  const duplicates = inSpec.filter((item, index) => inSpec.indexOf(item) !== index);
  expect({
    missingFromSpec: inCode.filter((item) => !inSpec.includes(item)).sort(),
    notInCode: inSpec.filter((item) => !inCode.includes(item)).sort(),
    duplicatedInSpec: [...new Set(duplicates)].sort(),
  }).toEqual({ missingFromSpec: [], notInCode: [], duplicatedInSpec: [] });
}

/** The one item of a list, or a failure that says there was not exactly one. */
function only<T>(items: readonly T[], what: string): T {
  const [first, ...rest] = items;
  if (first === undefined || rest.length > 0) {
    throw new Error(`Expected exactly one ${what}, found ${items.length}.`);
  }
  return first;
}

/** The rows of a table as mutable arrays, which is what `it.each` takes. */
function rowsOf(tables: readonly Table[]): string[][] {
  return tables.flatMap((table) => table.rows.map((row) => [...row]));
}

function unwrap<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) throw new Error(`Unexpected failure: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe('the reader of the specification files', () => {
  const sample = [
    '# Title',
    '',
    '### `CONSTANT` and more',
    '',
    '| Value | Meaning |',
    '| ----- | ------- |',
    '| `one` | A \\| B  |',
    '| `two` | Two     |',
    '',
    '| Other | Meaning |',
    '| ----- | ------- |',
    '| `x`   | not read, see [t](t.md) |',
    '',
    '```mermaid',
    '| Value | Not a table |',
    '```',
    '',
    'See [the doc](domain.md#limits) and `[not](a-link)`.',
  ].join('\n');
  const document = parseSpecText('sample.md', sample);

  it('reads a checked table with the subject of its heading', () => {
    const tables = tablesOfKind(document, TABLE_KIND.Value);

    const table = only(tables, 'checked table');

    expect(table.subject).toBe('CONSTANT');
    expect(identifiersOf(table)).toEqual(['one', 'two']);
  });

  it('reads an escaped bar as a bar and leaves tables of other kinds unchecked', () => {
    expect(splitRow('| `a` | A \\| B |')).toEqual(['`a`', 'A | B']);
    expect(document.tables.filter((table) => !table.checked)).toHaveLength(1);
  });

  it('skips fenced blocks, keeps them, and reads the links outside code', () => {
    expect(document.fences).toEqual([
      { language: 'mermaid', body: '| Value | Not a table |', line: 14 },
    ]);
    expect(document.links.map((link) => link.target)).toEqual(['t.md', 'domain.md#limits']);
  });

  it('reads the tokens between backticks and the anchors', () => {
    expect(firstCode('a `b` and `c`')).toBe('b');
    expect(allCodes('a `b` and `c`')).toEqual(['b', 'c']);
    expect(slugOf('`ACCESS` - where the user stands')).toBe('access---where-the-user-stands');
    expect(sectionLines(document, only(document.headings.slice(1, 2), 'heading'))).toContain(
      '| `two` | Two     |',
    );
  });
});

describe('the files of the specification', () => {
  it('only have checked tables of a kind that belongs to them', () => {
    const allowed: Record<string, readonly string[]> = {
      [TABLE_KIND.Code]: ['domain.md'],
      [TABLE_KIND.Value]: ['domain.md', 'use-cases.md', 'ports.md', 'screens.md'],
      [TABLE_KIND.Limit]: ['domain.md'],
      [TABLE_KIND.UseCase]: ['use-cases.md'],
      [TABLE_KIND.Setting]: ['use-cases.md'],
      [TABLE_KIND.Port]: ['ports.md'],
      [TABLE_KIND.Operation]: ['ports.md'],
      [TABLE_KIND.Route]: ['screens.md'],
      [TABLE_KIND.TestId]: ['screens.md'],
      [TABLE_KIND.Builder]: ['screens.md'],
    };
    const misplaced = SPEC_FILES.flatMap((document) =>
      tablesOfKind(document, ...Object.values(TABLE_KIND))
        .filter((table) => !(allowed[table.kind] ?? []).includes(document.file))
        .map((table) => `${document.file}:${table.line} ${table.kind}`),
    );

    expect(misplaced).toEqual([]);
  });

  it('give every row of a checked table an identifier in backticks', () => {
    const missing = SPEC_FILES.flatMap((document) =>
      tablesOfKind(document, ...Object.values(TABLE_KIND)).flatMap((table) =>
        table.rows
          .filter((row) => firstCode(row[0] ?? '') === undefined)
          .map((row) => `${document.file}:${table.line} ${row[0] ?? ''}`),
      ),
    );

    expect(missing).toEqual([]);
  });

  it('only link to files and headings that exist', () => {
    const broken = SPEC_FILES.flatMap((document) =>
      document.links.flatMap((link) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(link.target)) return [];
        const [file = '', fragment] = link.target.split('#');
        const target = file === '' ? path.join(SPEC, document.file) : path.resolve(SPEC, file);
        if (!fs.existsSync(target)) return [`${document.file}:${link.line} ${link.target}`];
        if (fragment === undefined || !target.endsWith('.md')) return [];
        const headings = readSpecFile(target).headings.map((heading) => heading.slug);
        return headings.includes(fragment) ? [] : [`${document.file}:${link.line} ${link.target}`];
      }),
    );

    expect(broken).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Enumerations and error codes
// ---------------------------------------------------------------------------------------------

/**
 * Where the enumerations of each part of the code are documented: the constants exported by the
 * folders (and files) on the left are the `Value` tables of the file on the right.
 */
const ENUMERATION_SOURCES: readonly {
  readonly document: SpecDocument;
  readonly files: readonly string[];
}[] = [
  { document: spec.domain, files: sourceFilesUnder('src/domain') },
  { document: spec.ports, files: sourceFilesUnder('src/application/ports') },
  {
    document: spec.useCases,
    files: [
      ...sourceFilesUnder('src/application/shared'),
      ...sourceFilesUnder('src/application/use-cases'),
    ],
  },
  {
    document: spec.screens,
    files: [
      path.join(ROOT, 'src/presentation/state/uiStore.tsx'),
      path.join(ROOT, 'src/presentation/hooks/resolutionVote.ts'),
    ],
  },
];

const ERROR_CODE_CONSTANT = /_ERROR_CODE$/;
const errorCodeConstants = enumerationsIn(sourceFilesUnder('src/domain/errors')).filter(
  ({ name }) => ERROR_CODE_CONSTANT.test(name),
);
const ERROR_CODES: readonly string[] = errorCodeConstants.flatMap(({ values }) => values);

describe('the enumerations and the error codes', () => {
  it('include the error codes of the domain', () => {
    expect(errorCodeConstants.length).toBeGreaterThanOrEqual(8);
    expect(ERROR_CODES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  describe.each(ENUMERATION_SOURCES)('documented in $document.file', ({ document, files }) => {
    const enumerations = enumerationsIn(files);
    const tables = tablesOfKind(document, TABLE_KIND.Code, TABLE_KIND.Value);

    it('has at least one constant to compare', () => {
      expect(enumerations.length).toBeGreaterThan(0);
    });

    it.each(enumerations)('lists every value of $name, and no other', ({ name, values }) => {
      const table = only(
        tables.filter((candidate) => candidate.subject === name),
        `table under the heading of ${name}`,
      );

      expectSameSet(values, identifiersOf(table));
    });

    it('has no table for a constant that does not exist', () => {
      const names = enumerations.map(({ name }) => name);
      const unknown = tables
        .filter((table) => table.subject === undefined || !names.includes(table.subject))
        .map((table) => `${document.file}:${table.line} ${table.subject ?? '(no subject)'}`);

      expect(unknown).toEqual([]);
    });
  });

  it('documents the error codes in tables of the kind `Code`', () => {
    const codeTables = tablesOfKind(spec.domain, TABLE_KIND.Code).map((table) => table.subject);
    const names = errorCodeConstants.map(({ name }) => name);

    expect([...codeTables].sort()).toEqual([...names].sort());
  });

  it('documents the other enumerations of the domain in tables of the kind `Value`', () => {
    const names = enumerationsIn(sourceFilesUnder('src/domain'))
      .map(({ name }) => name)
      .filter((name) => !ERROR_CODE_CONSTANT.test(name));
    const valueTables = tablesOfKind(spec.domain, TABLE_KIND.Value).map((table) => table.subject);

    expect([...valueTables].sort()).toEqual([...names].sort());
  });
});

// ---------------------------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------------------------

describe('the use cases', () => {
  const inCode = useCaseNamesIn(sourceFilesUnder('src/application/use-cases'));
  const indexTables = tablesOfKind(spec.useCases, TABLE_KIND.UseCase);
  const inSpec = indexTables.flatMap(identifiersOf);
  const portNames = portsIn(sourceFilesUnder('src/application/ports')).map(({ name }) => name);

  it('are found in the code', () => {
    expect(inCode.length).toBeGreaterThanOrEqual(15);
  });

  it('are the use case classes of src/application/use-cases, no more, no fewer', () => {
    expect(indexTables).toHaveLength(1);
    expectSameSet(inCode, inSpec);
  });

  describe.each(inCode)('%s', (name) => {
    const heading = spec.useCases.headings.find((candidate) => candidate.subject === name);
    const section = heading === undefined ? [] : sectionLines(spec.useCases, heading);
    const lineOf = (label: string): string[] =>
      section.filter((line) => line.startsWith(`- **${label}**:`));

    it('has a section of its own', () => {
      expect(heading).toBeDefined();
      expect(spec.useCases.headings.filter((candidate) => candidate.subject === name)).toHaveLength(
        1,
      );
    });

    it('lists the ports it uses, and they are ports', () => {
      const lines = lineOf('Ports');
      const cited = lines.flatMap(allCodes);

      expect(lines).toHaveLength(1);
      expect(cited.filter((port) => !portNames.includes(port))).toEqual([]);
      expect(lines[0] === undefined || cited.length > 0 || /none/i.test(lines[0])).toBe(true);
    });

    it('lists the error codes it can return, and they are error codes', () => {
      const lines = lineOf('Errors');
      const cited = lines.flatMap(allCodes);

      expect(lines).toHaveLength(1);
      expect(cited.filter((code) => !ERROR_CODES.includes(code))).toEqual([]);
      expect(lines[0] === undefined || cited.length > 0 || /none/i.test(lines[0])).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------------------------

/** The name of each parameter of a signature: `a: A, b?: B<C, D>` is `a`, `b`. `-` is none. */
function parameterNames(cell: string): string[] {
  const signature = cell.replaceAll('`', '');
  if (signature.trim() === '-') return [];
  const names: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of signature) {
    if ('<([{'.includes(char)) depth += 1;
    if ('>)]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      names.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  names.push(current);
  return names.map((parameter) => (parameter.split(':')[0] ?? '').trim().replace(/\?$/, ''));
}

describe('the ports', () => {
  const inCode = portsIn(sourceFilesUnder('src/application/ports'));
  const indexTables = tablesOfKind(spec.ports, TABLE_KIND.Port);
  const operationTables = tablesOfKind(spec.ports, TABLE_KIND.Operation);

  it('are found in the code', () => {
    expect(inCode.length).toBeGreaterThanOrEqual(10);
  });

  it('are the interfaces with operations of src/application/ports, no more, no fewer', () => {
    expect(indexTables).toHaveLength(1);
    expectSameSet(
      inCode.map(({ name }) => name),
      indexTables.flatMap(identifiersOf),
    );
  });

  it('have no table of operations for something that is not a port', () => {
    const names = inCode.map(({ name }) => name);

    expect(
      operationTables
        .filter((table) => table.subject === undefined || !names.includes(table.subject))
        .map((table) => `ports.md:${table.line} ${table.subject ?? '(no subject)'}`),
    ).toEqual([]);
  });

  describe.each(inCode)('$name', ({ name, operations }) => {
    const tables = operationTables.filter((table) => table.subject === name);

    it('has one table of operations', () => {
      expect(tables).toHaveLength(1);
    });

    it('lists every operation of the interface, and no other', () => {
      expectSameSet(
        operations.map((operation) => operation.name),
        tables.flatMap(identifiersOf),
      );
    });

    it.each(operations)('gives the parameters of $name in the order of the code', (operation) => {
      const row = tables
        .flatMap((table) => table.rows)
        .find((candidate) => firstCode(candidate[0] ?? '') === operation.name);

      expect(parameterNames(row?.[1] ?? '(no row)')).toEqual(operation.parameters);
    });

    it('cites only error codes that exist', () => {
      const header = tables[0]?.header ?? [];
      const column = header.indexOf('Errors');
      const cited = (tables[0]?.rows ?? []).flatMap((row) => allCodes(row[column] ?? ''));

      expect(column).toBeGreaterThan(0);
      expect(cited.filter((code) => !ERROR_CODES.includes(code))).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Screens: routes, test ids, builders, navigation map
// ---------------------------------------------------------------------------------------------

describe('the routes', () => {
  const routeTables = tablesOfKind(spec.screens, TABLE_KIND.Route);
  const inCode = routesOfApp();

  it('are the screen files of app/, no more, no fewer', () => {
    expect(routeTables).toHaveLength(1);
    expectSameSet(inCode, routeTables.flatMap(identifiersOf));
  });

  it('are the routes of the constants of the presentation layer', () => {
    expect([...Object.values(ROUTES)].sort()).toEqual([...inCode].sort());
  });

  it('give the dynamic segments of each route', () => {
    const rows = routeTables.flatMap((table) => table.rows);
    const parametersInSpec = rows.map((row) => ({
      route: firstCode(row[0] ?? ''),
      parameters: allCodes(row[1] ?? '').sort(),
    }));
    const parametersInCode = inCode.map((route) => ({
      route,
      parameters: parametersOfRoute(route).sort(),
    }));

    expect(parametersInSpec.sort((a, b) => (a.route ?? '').localeCompare(b.route ?? ''))).toEqual(
      parametersInCode,
    );
    expect(Object.values(ROUTE_PARAMS).sort()).toEqual(
      [...new Set(inCode.flatMap(parametersOfRoute))].sort(),
    );
  });

  it('are all drawn on the navigation map', () => {
    const maps = spec.screens.fences.filter((fence) => fence.language === 'mermaid');

    expect(maps.length).toBeGreaterThan(0);
    expect(inCode.filter((route) => !maps.some((map) => map.body.includes(route)))).toEqual([]);
  });
});

describe('the test ids', () => {
  const idTables = tablesOfKind(spec.screens, TABLE_KIND.TestId);
  const rows = rowsOf(idTables);
  const inSpec = rows.map((row) => firstCode(row[0] ?? '') ?? '');

  it('are the values of TEST_IDS, each once, no more, no fewer', () => {
    expect(idTables.length).toBeGreaterThan(0);
    expectSameSet(Object.values(testIds.TEST_IDS), inSpec);
  });

  it.each(rows)('names the constant of %s', (idCell, constantCell) => {
    const id = firstCode(idCell) ?? '';
    const constant = firstCode(constantCell ?? '') ?? '(none)';
    const entries: Record<string, string> = testIds.TEST_IDS;

    expect(entries[constant]).toBe(id);
  });
});

describe('the test id builders', () => {
  const builderTables = tablesOfKind(spec.screens, TABLE_KIND.Builder);
  const rows = rowsOf(builderTables);
  const builders = Object.entries(testIds).flatMap(([name, value]) =>
    typeof value === 'function' ? [{ name, builder: value }] : [],
  );

  it('are the builder functions of testIds.ts, no more, no fewer', () => {
    expect(builderTables).toHaveLength(1);
    expectSameSet(
      builders.map(({ name }) => name),
      rows.map((row) => firstCode(row[0] ?? '') ?? ''),
    );
  });

  it.each(builders)('gives the parameters and the pattern of $name', ({ name, builder }) => {
    const row = rows.find((candidate) => firstCode(candidate[0] ?? '') === name);
    const parameters = (row?.[1] ?? '')
      .split(',')
      .map((parameter) => parameter.trim())
      .filter((parameter) => parameter !== '');
    const pattern = firstCode(row?.[2] ?? '');

    expect(builder).toHaveLength(parameters.length);

    // Each parameter gets a sentinel; reading them back by name gives the pattern of the id.
    const sentinels = parameters.map((parameter) => `\u0001${parameter}\u0002`);
    const built: unknown = Reflect.apply(builder, undefined, sentinels);
    const named =
      typeof built === 'string'
        ? parameters.reduce(
            (text, parameter) => text.replaceAll(`\u0001${parameter}\u0002`, `{${parameter}}`),
            built,
          )
        : built;

    expect(named).toBe(pattern);
  });
});

// ---------------------------------------------------------------------------------------------
// Limits and settings
// ---------------------------------------------------------------------------------------------

const text = (length: number): string => 'a'.repeat(length);
const userId = unwrap(parseUserId('u'));
const meetingId = unwrap(parseMeetingId('m'));
const documentId = unwrap(parseDocumentId('d'));
const resolutionId = unwrap(parseResolutionId('r'));
const email = unwrap(parseEmailAddress('a@b.co'));
const instant = unwrap(parseInstant(0));
const vote = createVote({
  resolutionId,
  meetingId,
  voterId: userId,
  choice: VOTE_CHOICE.For,
  castAt: instant,
});

/** For each limit of the spec, whether the code accepts a value of that size. */
const PROBES: Readonly<Record<string, (size: number) => boolean>> = {
  identifier: (size) =>
    [parseUserId, parseMeetingId, parseAgendaItemId, parseResolutionId, parseDocumentId].every(
      (parse) => parse(text(size)).ok,
    ),
  email: (size) => parseEmailAddress(`${text(Math.max(size - 5, 0))}@b.co`).ok,
  fullName: (size) =>
    createUser({ id: userId, fullName: text(size), email }).ok &&
    createParticipant({ userId, fullName: text(size), role: PARTICIPANT_ROLE.Member }).ok,
  title: (size) =>
    createDocument({
      id: documentId,
      title: text(size),
      confidentiality: CONFIDENTIALITY_LEVEL.Public,
      pageCount: 1,
    }).ok &&
    createMeetingSummary({ id: meetingId, title: text(size), scheduledAt: instant, location: 'x' })
      .ok &&
    createResolution({
      id: resolutionId,
      title: text(size),
      description: 'x',
      status: RESOLUTION_STATUS.Open,
    }).ok &&
    createAgendaItem({ id: unwrap(parseAgendaItemId('a')), position: 1, title: text(size) }).ok,
  description: (size) =>
    createResolution({
      id: resolutionId,
      title: 'x',
      description: text(size),
      status: RESOLUTION_STATUS.Open,
    }).ok &&
    // An agenda item may have no description (a blank one is none): its maximum is the same.
    (size === 0 ||
      createAgendaItem({
        id: unwrap(parseAgendaItemId('a')),
        position: 1,
        title: 'x',
        description: text(size),
      }).ok),
  meetingLocation: (size) =>
    createMeetingSummary({
      id: meetingId,
      title: 'x',
      scheduledAt: instant,
      location: text(size),
    }).ok,
  pageCursor: (size) => parsePageCursor(text(size)).ok,
  documentLocation: (size) => parseDocumentLocation(text(size)).ok,
  pageCount: (size) =>
    createDocument({
      id: documentId,
      title: 'x',
      confidentiality: CONFIDENTIALITY_LEVEL.Public,
      pageCount: size,
    }).ok,
  agendaPosition: (size) =>
    createAgendaItem({ id: unwrap(parseAgendaItemId('a')), position: size, title: 'x' }).ok,
  pageLimit: (size) => createPageRequest({ limit: size }).ok,
  attemptCount: (size) => restorePendingVote({ vote, enqueuedAt: instant, attempts: size }).ok,
  duration: (size) => durationFromMillis(size).ok,
  instant: (size) => parseInstant(size).ok,
};

/** A number written in a cell of the spec, with or without separators. */
function numberIn(cell: string): number | undefined {
  const digits = cell.replace(/[^0-9]/g, '');
  return digits === '' ? undefined : Number(digits);
}

describe('the limits', () => {
  const tables = tablesOfKind(spec.domain, TABLE_KIND.Limit);
  const rows = rowsOf(tables);

  it('are probed one by one', () => {
    expect(tables).toHaveLength(1);
    expectSameSet(
      Object.keys(PROBES),
      rows.map((row) => firstCode(row[0] ?? '') ?? ''),
    );
  });

  it.each(rows)('has the bounds of %s in the code', (nameCell, minCell, maxCell) => {
    const name = firstCode(nameCell) ?? '';
    const probe = PROBES[name];
    const min = numberIn(minCell ?? '');
    const max = numberIn(maxCell ?? '');

    expect(probe).toBeDefined();
    if (probe === undefined || max === undefined) throw new Error(`No bounds for ${name}`);
    expect(probe(max)).toBe(true);
    expect(probe(max + 1)).toBe(false);
    if (min !== undefined) {
      expect(probe(min)).toBe(true);
      if (min > 0) expect(probe(min - 1)).toBe(false);
    }
  });
});

describe('the settings', () => {
  const config = loadModule(path.join(ROOT, 'src/di/config.ts'));
  const rows = rowsOf(tablesOfKind(spec.useCases, TABLE_KIND.Setting));

  it('are documented', () => {
    expect(rows.length).toBeGreaterThan(5);
  });

  it.each(rows)('has the default value of %s in the code', (nameCell, valueCell) => {
    const name = firstCode(nameCell) ?? '';
    const value = config[name];

    expect(value).toBeDefined();
    expect(String(value)).toBe((valueCell ?? '').replaceAll('`', '').trim());
  });
});
