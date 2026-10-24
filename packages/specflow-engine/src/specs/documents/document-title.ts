/**
 * Display title of a document (architecture "Identity, paths and the registry"): derived, never
 * stored. The first level-1 heading of a markdown text, else the file stem. A YAML frontmatter block
 * is skipped (it is not consulted for the title, and its `#` comments are not headings), and so are
 * fenced code blocks.
 */

const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set(['md', 'markdown']);

/** File name without its last extension (`a/b.v2.md` gives `b.v2`; a dotfile-less name stays whole). */
export function fileStem(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const index = name.lastIndexOf('.');
  return index <= 0 ? name : name.slice(0, index);
}

export function deriveDocumentTitle(path: string, text: string | undefined): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (text !== undefined && path.includes('.') && MARKDOWN_EXTENSIONS.has(extension)) {
    const heading = firstLevelOneHeading(text);
    if (heading !== undefined) return heading;
  }
  return fileStem(path);
}

function firstLevelOneHeading(text: string): string | undefined {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = withoutBom.split(/\r\n|\n|\r/u);
  let index = 0;
  if (lines[0]?.trimEnd() === '---') {
    const close = lines.findIndex((line, at) => at > 0 && /^(?:---|\.\.\.)\s*$/u.test(line));
    if (close > 0) index = close + 1;
  }
  let fence: string | undefined;
  for (; index < lines.length; index += 1) {
    const line = lines[index]!;
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) fence = marker;
      else if (marker.startsWith(fence[0]!) && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const title = atxLevelOneTitle(line);
    if (title !== undefined && title.length > 0) return capTitle(title);
  }
  return undefined;
}

/** Longest derived title, in characters. */
export const DOCUMENT_TITLE_MAX_CHARACTERS = 200;

function capTitle(title: string): string {
  // Slice generously first so a megabyte line is never spread into code points.
  return [...title.slice(0, DOCUMENT_TITLE_MAX_CHARACTERS * 2)]
    .slice(0, DOCUMENT_TITLE_MAX_CHARACTERS)
    .join('');
}

/**
 * The text of an ATX level-1 heading (`# Title`, up to three leading spaces, optional closing `#`
 * run), or `undefined` when the line is not one. Parsed by hand: linear time on any input (a
 * backtracking regular expression with nested quantifiers is quadratic on long whitespace runs).
 */
function atxLevelOneTitle(line: string): string | undefined {
  let index = 0;
  while (index < 3 && line[index] === ' ') index += 1;
  if (line[index] !== '#') return undefined;
  index += 1;
  if (line[index] !== ' ' && line[index] !== '	') return undefined;
  let text = line.slice(index).trim();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end -= 1;
  // A closing run of `#` counts only after a space or tab (or when it is the whole text).
  if (end < text.length && (end === 0 || text[end - 1] === ' ' || text[end - 1] === '	')) {
    text = text.slice(0, end).trim();
  }
  return text;
}
