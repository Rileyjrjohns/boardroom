import fs from 'node:fs';
import path from 'node:path';

import { parseSpecText } from './specMarkdown';
import type { SpecDocument } from './specMarkdown';

// The check of the relative links of the Markdown documents (README.md, docs/*.md, docs/adr/*.md),
// on the reader that `docs/spec` already uses (`specMarkdown.ts`). A link is good when its file
// exists and, if it has a fragment, when the target is a Markdown file that has a heading with that
// anchor. The anchors are the ones GitHub gives: the slug of the heading, with `-1`, `-2` added to
// the second and later headings that have the same slug.

/** A link that does not resolve. */
export interface LinkProblem {
  readonly line: number;
  readonly target: string;
  readonly reason: string;
}

/** The anchors of a document, as GitHub numbers them when two headings have the same slug. */
export function anchorsOf(document: SpecDocument): ReadonlySet<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const heading of document.headings) {
    const count = seen.get(heading.slug) ?? 0;
    seen.set(heading.slug, count + 1);
    anchors.add(count === 0 ? heading.slug : `${heading.slug}-${count}`);
  }
  return anchors;
}

/** Whether the link goes outside the repository (`https:`, `mailto:`, ...). */
export function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

/** Where a relative link of a document points on disk, and its fragment. */
export function resolveLink(
  documentFile: string,
  target: string,
): { readonly file: string; readonly fragment: string | undefined } {
  const hash = target.indexOf('#');
  const filePart = hash === -1 ? target : target.slice(0, hash);
  const fragment = hash === -1 ? undefined : target.slice(hash + 1);
  const file =
    filePart === '' ? documentFile : path.resolve(path.dirname(documentFile), decode(filePart));
  return { file, fragment };
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The links of a document that do not resolve. `skip` names the files that are not checked here
 * (the images that are added after the text, see the media test of `docs.test.ts`).
 */
export function linkProblems(
  documentFile: string,
  options: { readonly skip?: (file: string) => boolean } = {},
): LinkProblem[] {
  const document = parseSpecText(
    path.basename(documentFile),
    fs.readFileSync(documentFile, 'utf8'),
  );
  const anchorsOfFile = new Map<string, ReadonlySet<string>>([[documentFile, anchorsOf(document)]]);
  const anchorsIn = (file: string): ReadonlySet<string> => {
    const known = anchorsOfFile.get(file);
    if (known !== undefined) return known;
    const parsed = parseSpecText(path.basename(file), fs.readFileSync(file, 'utf8'));
    const anchors = anchorsOf(parsed);
    anchorsOfFile.set(file, anchors);
    return anchors;
  };

  const problems: LinkProblem[] = [];
  for (const link of document.links) {
    if (isExternal(link.target)) continue;
    const { file, fragment } = resolveLink(documentFile, link.target);
    if (options.skip?.(file) === true) continue;
    const problem = (reason: string): void => {
      problems.push({ line: link.line, target: link.target, reason });
    };
    if (!fs.existsSync(file)) {
      problem('the file does not exist');
      continue;
    }
    if (fragment === undefined || fragment === '') continue;
    if (!fs.statSync(file).isFile() || !file.endsWith('.md')) {
      problem('a fragment needs a Markdown file');
      continue;
    }
    if (!anchorsIn(file).has(fragment)) problem(`no heading has the anchor #${fragment}`);
  }
  return problems;
}

/** The `.md` files directly in a folder, as absolute paths, in name order. */
export function markdownFilesIn(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}
