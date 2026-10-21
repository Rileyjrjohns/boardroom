import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { anchorsOf, isExternal, linkProblems, markdownFilesIn, resolveLink } from './docsLinks';
import { parseSpecText } from './specMarkdown';

// The links of the documents: README.md, docs/*.md and docs/adr/*.md. Every relative link must point
// to a file that exists and, when it has a fragment, to a heading that has that anchor. The files of
// docs/spec are checked by spec.test.ts, which reads them as a specification; the links that other
// documents make to them are checked here. The pictures of the README are checked apart, below.

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const MEDIA = path.join(DOCS, 'media');

const README = path.join(ROOT, 'README.md');
const DOCUMENTS = [README, ...markdownFilesIn(DOCS), ...markdownFilesIn(path.join(DOCS, 'adr'))];

const isMedia = (file: string): boolean => file.startsWith(`${MEDIA}${path.sep}`);

describe('the links of the documents', () => {
  it.each(DOCUMENTS.map((file) => [path.relative(ROOT, file), file] as const))(
    '%s only links to files and headings that exist',
    (_name, file) => {
      const broken = linkProblems(file, { skip: isMedia }).map(
        (problem) =>
          `${path.relative(ROOT, file)}:${problem.line} ${problem.target}: ${problem.reason}`,
      );

      expect(broken).toEqual([]);
    },
  );

  it('covers the README, the documents of docs/ and the decision records', () => {
    const relative = DOCUMENTS.map((file) => path.relative(ROOT, file).split(path.sep).join('/'));

    expect(relative).toEqual(
      expect.arrayContaining(['README.md', 'docs/README.md', 'docs/adr/README.md', 'docs/api.md']),
    );
    expect(relative.some((file) => file.startsWith('docs/spec/'))).toBe(false);
  });

  it('links every document of docs/ from its index', () => {
    const index = parseSpecText('README.md', fs.readFileSync(path.join(DOCS, 'README.md'), 'utf8'));
    const linked = new Set(index.links.map((link) => link.target.split('#')[0]));

    const orphans = markdownFilesIn(DOCS)
      .map((file) => path.basename(file))
      .filter((name) => name !== 'README.md' && !linked.has(name));

    expect(orphans).toEqual([]);
  });

  it('lists every decision record in the index of the records', () => {
    const index = parseSpecText(
      'README.md',
      fs.readFileSync(path.join(DOCS, 'adr', 'README.md'), 'utf8'),
    );
    const linked = new Set(index.links.map((link) => link.target));

    const unlisted = markdownFilesIn(path.join(DOCS, 'adr'))
      .map((file) => path.basename(file))
      .filter((name) => /^\d{4}-/.test(name) && !linked.has(name));

    expect(unlisted).toEqual([]);
  });
});

describe('the pictures of docs/media', () => {
  // The pictures (the demo GIF and the screenshots of the README) are made after the text, so the
  // README links to files that do not exist yet when this check is written. The links to docs/media
  // are left out of the test above. This one checks them, and it runs as soon as the folder exists:
  // until then it shows as skipped, not as passed, and no placeholder picture is committed.
  const mediaLinks = (): {
    readonly document: string;
    readonly line: number;
    readonly file: string;
  }[] =>
    DOCUMENTS.flatMap((document) =>
      parseSpecText(path.basename(document), fs.readFileSync(document, 'utf8')).links.flatMap(
        (link) => {
          if (isExternal(link.target)) return [];
          const { file } = resolveLink(document, link.target);
          return isMedia(file)
            ? [{ document: path.relative(ROOT, document), line: link.line, file }]
            : [];
        },
      ),
    );

  (fs.existsSync(MEDIA) ? it : it.skip)('exist for every link that points to them', () => {
    const missing = mediaLinks()
      .filter(({ file }) => !fs.existsSync(file))
      .map(({ document, line, file }) => `${document}:${line} ${path.relative(ROOT, file)}`);

    expect(missing).toEqual([]);
  });

  it('all have a text for the reader', () => {
    const withoutAlt = DOCUMENTS.flatMap((document) =>
      fs
        .readFileSync(document, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          [...line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)]
            .filter((match) => (match[1] ?? '').trim() === '')
            .map(() => `${path.relative(ROOT, document)}:${index + 1}`),
        ),
    );

    expect(withoutAlt).toEqual([]);
  });
});

describe('the check of the links', () => {
  let directory = '';

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'boardroom-docs-'));
    fs.mkdirSync(path.join(directory, 'sub'));
    fs.writeFileSync(
      path.join(directory, 'target.md'),
      '# Target\n\n## Same\n\n## Same\n\n## Other `code`\n',
    );
    fs.writeFileSync(path.join(directory, 'sub', 'image.png'), 'x');
  });

  afterAll(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function problemsOf(text: string, skip?: (file: string) => boolean): string[] {
    const file = path.join(directory, 'doc.md');
    fs.writeFileSync(file, text);
    return linkProblems(file, skip === undefined ? {} : { skip }).map(
      (problem) => `${problem.line} ${problem.target}`,
    );
  }

  it('accepts files, directories, own and other anchors, and links outside the repository', () => {
    const text = [
      '# Doc',
      '',
      '## Part',
      '',
      '[a](target.md) [b](target.md#target) [c](#part) [d](sub/) [e](https://example.com/#x)',
      '[f](target.md#same) [g](target.md#same-1) [h](target.md#other-code) [i](sub/image.png)',
    ].join('\n');

    expect(problemsOf(text)).toEqual([]);
  });

  it('reports a missing file, a missing anchor and an anchor on a file that is not Markdown', () => {
    const text = [
      '# Doc',
      '',
      '[a](missing.md)',
      '[b](target.md#nowhere)',
      '[c](#nowhere)',
      '[d](sub/image.png#top)',
      '[e](target.md#same-2)',
    ].join('\n');

    expect(problemsOf(text)).toEqual([
      '3 missing.md',
      '4 target.md#nowhere',
      '5 #nowhere',
      '6 sub/image.png#top',
      '7 target.md#same-2',
    ]);
  });

  it('leaves out the files that the caller names, and links inside code', () => {
    const text = ['# Doc', '', '![x](sub/later.png) and `[y](missing.md)`'].join('\n');

    expect(problemsOf(text)).toEqual(['3 sub/later.png']);
    expect(problemsOf(text, (file) => file.endsWith('later.png'))).toEqual([]);
  });

  it('numbers the headings that share a slug the way GitHub does', () => {
    const anchors = anchorsOf(parseSpecText('t.md', '# A\n\n## A\n\n## A\n\n## B c\n'));

    expect([...anchors]).toEqual(['a', 'a-1', 'a-2', 'b-c']);
  });
});
