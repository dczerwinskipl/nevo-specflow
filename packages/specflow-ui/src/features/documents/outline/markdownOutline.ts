/**
 * The document panel is wide enough (px, measured on the panel, not the viewport) to show the
 * contents and properties in a column beside the text; narrower panels open the contents as a
 * sheet. At 880 px the text keeps 554 px (about 65 characters) beside a 246 px column.
 */
export const outlineColumnMinWidth = 880;

/** The text keeps at least this many px (about 65 characters) beside the column. */
export const outlineTextMinWidth = 520;
const outlinePanelPadding = 48;
const outlineGap = 32;

/**
 * The width of the contents column in a panel of `panelWidth` px: 28% of the panel, between 240 and
 * 320 px. At the threshold (880) that leaves the text 880 - 48 - 32 - 246 = 554 px.
 */
export function outlineColumnWidth(panelWidth: number): number {
  return Math.round(Math.min(320, Math.max(240, panelWidth * 0.28)));
}

/** Room left for the text in a panel with the column. */
export const outlineTextWidth = (panelWidth: number) =>
  panelWidth - outlinePanelPadding - outlineGap - outlineColumnWidth(panelWidth);

/** One heading of a document: where it is (source line, 1-based) and how deep. */
export interface OutlineHeading {
  /** The line the heading text is on; `MarkdownDocument sourceLines` marks the rendered heading with it. */
  readonly line: number;
  readonly level: 1 | 2 | 3 | 4;
  readonly text: string;
}

const atx = /^ {0,3}(#{1,4})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const fenceOpen = /^ {0,3}(`{3,}|~{3,})/;
const setext = /^ {0,3}(=+|-+)[ \t]*$/;

/** Inline markup that does not belong in a list of headings. */
function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .trim();
}

/**
 * The h1-h4 headings of a markdown source, read the way the preview renders them: ATX (`## Title`)
 * and setext (`Title` over `===` / `---`), none inside fenced code. Pass the body with a frontmatter
 * block replaced by empty lines, so line numbers stay those of the file.
 */
export function markdownOutline(source: string): OutlineHeading[] {
  const lines = source.split(/\r?\n/);
  const headings: OutlineHeading[] = [];
  let fence: { char: string; size: number } | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const opened = fenceOpen.exec(line);
    if (fence) {
      const marker = opened?.[1];
      if (marker?.startsWith(fence.char) && marker.length >= fence.size && line.trim() === marker)
        fence = undefined;
      continue;
    }
    if (opened) {
      fence = { char: opened[1]![0]!, size: opened[1]!.length };
      continue;
    }
    const heading = atx.exec(line);
    if (heading) {
      const text = plain(heading[2]!);
      if (text)
        headings.push({ line: index + 1, level: heading[1]!.length as 1 | 2 | 3 | 4, text });
      continue;
    }
    // Setext: a paragraph line directly above an underline. A blank, list or quote line above is not.
    const underline = setext.exec(lines[index + 1] ?? '');
    if (
      underline &&
      line.trim() !== '' &&
      !/^ {0,3}([-*+]|\d+[.)]|>|#)/.test(line) &&
      !/^( {4}|\t)/.test(line) &&
      !setext.test(line)
    ) {
      const text = plain(line);
      if (text)
        headings.push({ line: index + 1, level: underline[1]!.startsWith('=') ? 1 : 2, text });
      index += 1;
    }
  }
  return headings;
}
