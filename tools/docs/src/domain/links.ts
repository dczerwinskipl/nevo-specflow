// Pure relative-link validation over the scanned corpus. Existence of a target outside the corpus
// (a directory, an image, a source file) is answered by the caller-supplied `pathExists`, which
// must compare path segments case-sensitively, as GitHub does.

import { posix } from 'node:path';

import type { DocRecord } from './frontmatter.js';

/** Repo-relative path (POSIX separators) -> does a file or directory exist there, exact case? */
export type PathExists = (repoRelPath: string) => boolean;

export interface MarkdownLink {
  readonly target: string;
  /** 1-based line within the document body. */
  readonly line: number;
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

/**
 * Blank out code blocks and HTML comments, keeping line structure: fenced code blocks (CommonMark
 * fences: up to three spaces of indent, three or more backticks or tildes, closed only by a fence of
 * the same character at least as long; an unclosed fence runs to the end) and `<!-- -->`. Indented
 * (four-space) code blocks are not detected: they cannot be told apart from list-item continuation
 * without a full parser. Inline code is kept, because heading slugs include its text.
 */
function stripBlocks(body: string): string {
  const lines = body.split('\n');
  let fence: { char: string; length: number } | undefined;
  for (const [i, line] of lines.entries()) {
    if (fence) {
      const close = new RegExp(
        `^ {0,3}${fence.char === '`' ? '`' : '~'}{${String(fence.length)},}\\s*$`,
      );
      if (close.test(line)) {
        fence = undefined;
      }

      lines[i] = blank(line);
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (open?.[1]) {
      fence = { char: open[1].charAt(0), length: open[1].length };
      lines[i] = blank(line);
    }
  }

  return lines.join('\n').replace(/<!--[\s\S]*?-->/g, blank);
}

/** {@link stripBlocks}, then inline code spans too: what remains is prose that can hold links. */
function stripNonProse(body: string): string {
  return stripBlocks(body).replace(/(`+)[^`\n][\s\S]*?\1/g, (m) =>
    m.includes('\n\n') ? m : blank(m),
  );
}

/**
 * Inline links/images `[text](target "title")`, with one level of balanced parentheses in the
 * target, and reference definitions `[x]: target`. Footnote definitions `[^x]:` are not links.
 */
export function extractLinks(body: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = stripNonProse(body).split('\n');
  for (const [i, text] of lines.entries()) {
    for (const m of text.matchAll(
      /\]\(\s*(?:<([^>\n]+)>|((?:[^()\s]|\([^()\s]*\))+))(?:\s+["'(][^)]*)?\s*\)/g,
    )) {
      links.push({ target: m[1] ?? m[2] ?? '', line: i + 1 });
    }

    const definition = /^ {0,3}\[(?!\^)[^\]]+\]:\s*(?:<([^>\n]+)>|(\S+))/.exec(text);
    if (definition) {
      links.push({ target: definition[1] ?? definition[2] ?? '', line: i + 1 });
    }
  }

  return links;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    }

    if (e.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(e.slice(1), 10));
    }

    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * GitHub-style heading slug (github-slugger on the rendered text): link syntax, inline code
 * markers, emphasis and HTML tags removed, entities decoded, lower-cased, punctuation dropped,
 * spaces to hyphens.
 */
export function slugifyHeading(heading: string): string {
  return decodeEntities(
    heading
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/`/g, '')
      .replace(/(^|[^\p{L}\p{N}])[*_]+|[*_]+(?=[^\p{L}\p{N}]|$)/gu, '$1'),
  )
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

/** Heading texts in document order: ATX (up to three spaces of indent) and setext. */
function headings(text: string): string[] {
  const out: string[] = [];
  const lines = text.split('\n');
  for (const [i, line] of lines.entries()) {
    const atx = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*(?:[ \t]#+[ \t]*)?$/.exec(line);
    if (atx) {
      out.push(atx[1] ?? '');
      continue;
    }

    const next = lines[i + 1];
    if (next !== undefined && line.trim() && /^ {0,3}(?:=+|-+)[ \t]*$/.test(next)) {
      // A `---` under a list item or a paragraph that ends a table is not a heading in practice;
      // GitHub treats a non-blank paragraph line followed by `===`/`---` as a setext heading.
      if (!/^ {0,3}(?:[-*+]|\d+[.)])\s|^\s*\|/.test(line)) {
        out.push(line.trim());
      }
    }
  }

  return out;
}

/** Every anchor a document defines: heading slugs (with GitHub duplicate suffixes) and HTML ids. */
export function documentAnchors(body: string): Set<string> {
  const anchors = new Set<string>();
  for (const heading of headings(stripBlocks(body))) {
    const base = slugifyHeading(heading);
    let slug = base;
    for (let n = 1; anchors.has(slug); n++) {
      slug = `${base}-${String(n)}`;
    }

    anchors.add(slug);
  }

  for (const m of stripNonProse(body).matchAll(
    /<a\b[^>]*?\s(?:name|id)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi,
  )) {
    anchors.add(m[1] ?? m[2] ?? '');
  }

  return anchors;
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * Every relative link in every scanned document must resolve inside the repository with the exact
 * case of its path, and a fragment pointing at a scanned Markdown document must name one of its
 * anchors.
 */
export function validateLinks(docs: readonly DocRecord[], pathExists: PathExists): string[] {
  const byFile = new Map(docs.map((d) => [d.file, d]));
  const byLowerFile = new Map(docs.map((d) => [d.file.toLowerCase(), d.file]));
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

      const where = `${doc.file} (body line ${String(line)})`;
      if (target.includes('\\')) {
        problems.push(`${where}: link '${target}' uses a backslash; use '/' separators`);
        continue;
      }

      const hash = target.indexOf('#');
      const beforeHash = hash === -1 ? target : target.slice(0, hash);
      const pathPart = decode(beforeHash.replace(/\?.*$/, ''));
      const fragment = hash === -1 ? '' : decode(target.slice(hash + 1));

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
          const caseVariant = byLowerFile.get(resolved.toLowerCase());
          problems.push(
            caseVariant
              ? `${where}: broken link '${target}' (case differs from '${caseVariant}')`
              : `${where}: broken link '${target}' (no such file or directory)`,
          );
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
