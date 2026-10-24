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
    const heading = /^ {0,3}#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/u.exec(line);
    if (heading) {
      const title = heading[1]!.trim();
      if (title.length > 0) return title;
    }
  }
  return undefined;
}
