/**
 * The document panel is wide enough (px, measured on the panel, not the viewport) to show the
 * contents and properties in a column beside the text; narrower panels open the contents as a
 * sheet. At 840 px the text keeps 528 px (about 62 characters) beside a 232 px column.
 */
export const outlineColumnMinWidth = 840;

/** The text keeps at least this many px (about 62 characters) beside the column. */
export const outlineTextMinWidth = 528;
const outlinePanelPadding = 48;
const outlineGap = 32;
/** Widest the contents column (and the guidance column) gets. */
const outlineColumnMaxWidth = 320;

/**
 * The width of the contents column in a panel of `panelWidth` px: 27% of the panel, between 232 and
 * 320 px. At the threshold (840) that leaves the text 840 - 48 - 32 - 232 = 528 px (about 62
 * characters); in a 1440 px window (877) 877 - 80 - 237 = 560 px.
 */
export function outlineColumnWidth(panelWidth: number): number {
  return Math.round(Math.min(outlineColumnMaxWidth, Math.max(232, panelWidth * 0.27)));
}

/** Room left for the text in a panel with the column. */
export const outlineTextWidth = (panelWidth: number) =>
  panelWidth - outlinePanelPadding - outlineGap - outlineColumnWidth(panelWidth);

/**
 * The document panel is wide enough (px) for the writing guidance as a third column: the text keeps
 * `outlineTextMinWidth` beside the contents column and the guidance column, both at their widest
 * (528 + 48 + 2 x (32 + 320) = 1280). In edit mode the source editor then keeps 960 px. Narrower
 * panels open the guidance as a sheet.
 */
export const guidanceColumnMinWidth =
  outlineTextMinWidth + outlinePanelPadding + 2 * (outlineGap + outlineColumnMaxWidth);

/** The guidance column is as wide as the contents column, so the two read as one family. */
export const guidanceColumnWidth = outlineColumnWidth;

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
      if (marker?.startsWith(fence.char) && marker.length >= fence.size && line.trim() === marker) {
        fence = undefined;
      }

      continue;
    }

    if (opened) {
      fence = { char: opened[1]![0]!, size: opened[1]!.length };
      continue;
    }

    const heading = atx.exec(line);
    if (heading) {
      const text = plain(heading[2]!);
      if (text) {
        headings.push({ line: index + 1, level: heading[1]!.length as 1 | 2 | 3 | 4, text });
      }

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
      if (text) {
        headings.push({ line: index + 1, level: underline[1]!.startsWith('=') ? 1 : 2, text });
      }

      index += 1;
    }
  }

  return headings;
}
