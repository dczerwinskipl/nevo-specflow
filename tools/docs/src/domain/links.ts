// Pure relative-link validation over the scanned corpus. Existence of a target outside the corpus
// (a directory, an image, a source file) is answered by the caller-supplied `pathExists`.

import { posix } from 'node:path';

import type { DocRecord } from './frontmatter.js';

/** Repo-relative path (POSIX separators) -> does a file or directory exist there? */
export type PathExists = (repoRelPath: string) => boolean;

export interface MarkdownLink {
  readonly target: string;
  /** 1-based line within the document body. */
  readonly line: number;
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Blank out fenced code blocks and inline code spans, keeping line structure. */
function stripCode(body: string): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, ' ');

  return body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank).replace(/`[^`\n]*`/g, blank);
}

/** Inline links/images `[text](target "title")` and reference definitions `[x]: target`. */
export function extractLinks(body: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = stripCode(body).split('\n');
  for (const [i, text] of lines.entries()) {
    for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\)/g)) {
      links.push({ target: m[1] ?? '', line: i + 1 });
    }

    const definition = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/.exec(text);
    if (definition) {
      links.push({ target: definition[1] ?? '', line: i + 1 });
    }
  }

  return links;
}

/** GitHub-style heading slug: lower-case, punctuation dropped, spaces to hyphens. */
export function slugifyHeading(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

/** Every anchor a document defines: heading slugs (with GitHub duplicate suffixes) and HTML ids. */
export function documentAnchors(body: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  const text = stripCode(body);
  for (const m of text.matchAll(/^#{1,6}[ \t]+(.+?)[ \t#]*$/gm)) {
    const base = slugifyHeading(m[1] ?? '');
    const count = seen.get(base);
    seen.set(base, (count ?? -1) + 1);
    anchors.add(count === undefined ? base : `${base}-${count + 1}`);
  }

  for (const m of body.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) {
    anchors.add(m[1] ?? '');
  }

  return anchors;
}

function decode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/**
 * Every relative link in every scanned document must resolve inside the repository; a fragment
 * pointing at a scanned Markdown document must name one of its anchors.
 */
export function validateLinks(docs: readonly DocRecord[], pathExists: PathExists): string[] {
  const byFile = new Map(docs.map((d) => [d.file, d]));
  const anchorCache = new Map<string, Set<string>>();
  const anchorsOf = (doc: DocRecord): Set<string> => {
    let anchors = anchorCache.get(doc.file);
    if (!anchors) {
      anchors = documentAnchors(doc.body);
      anchorCache.set(doc.file, anchors);
    }

    return anchors;
  };

  const problems: string[] = [];
  for (const doc of docs) {
    for (const { target, line } of extractLinks(doc.body)) {
      if (!target || EXTERNAL.test(target)) {
        continue;
      }

      const hash = target.indexOf('#');
      const pathPart = decode(hash === -1 ? target : target.slice(0, hash));
      const fragment = hash === -1 ? '' : decode(target.slice(hash + 1));
      const where = `${doc.file} (body line ${line})`;

      let resolved = doc.file;
      if (pathPart) {
        resolved = posix.normalize(
          pathPart.startsWith('/')
            ? pathPart.slice(1)
            : posix.join(posix.dirname(doc.file), pathPart),
        );
        if (resolved === '..' || resolved.startsWith('../')) {
          problems.push(`${where}: link '${target}' points outside the repository`);
          continue;
        }

        resolved = resolved.replace(/\/$/, '');
        if (!byFile.has(resolved) && !pathExists(resolved)) {
          problems.push(`${where}: broken link '${target}' (no such file or directory)`);
          continue;
        }
      }

      const targetDoc = byFile.get(resolved);
      if (fragment && targetDoc && !anchorsOf(targetDoc).has(fragment)) {
        problems.push(`${where}: broken link '${target}' (no heading '#${fragment}')`);
      }
    }
  }

  return problems;
}
