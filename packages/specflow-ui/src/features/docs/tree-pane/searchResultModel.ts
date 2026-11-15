/** What a result row shows of its best section's heading path: at most `parent › leaf`. */
export interface SectionPath {
  /** The heading above the leaf, shown only when it fits whole beside the leaf. */
  readonly parent?: string;
  readonly leaf: string;
  /** The whole heading path as answered, for the row's title attribute. */
  readonly full: string;
}

export const sectionPathSeparator = ' › ';

const comparable = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The path line of a result: a leading heading equal to the document's title (compared without
 * case or extra spaces) is dropped, then the last two headings are kept. `undefined` when nothing
 * is left, so the row has no path line.
 */
export function sectionPathOf(
  title: string,
  headingPath: readonly string[],
): SectionPath | undefined {
  const rest =
    headingPath.length > 0 && comparable(headingPath[0]!) === comparable(title)
      ? headingPath.slice(1)
      : headingPath;
  const leaf = rest.at(-1);
  if (leaf === undefined) {
    return undefined;
  }

  return {
    ...(rest.length > 1 ? { parent: rest.at(-2)! } : {}),
    leaf,
    full: headingPath.join(sectionPathSeparator),
  };
}

/**
 * Whether the parent fits whole beside the whole leaf on one line of `available` pixels. Otherwise
 * only the leaf shows (and it alone may end in an ellipsis): a parent is never cut.
 */
export function parentFits(widths: {
  readonly parent: number;
  readonly separator: number;
  readonly leaf: number;
  readonly available: number;
}): boolean {
  return widths.available > 0 && widths.parent + widths.separator + widths.leaf <= widths.available;
}

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** A piece of an excerpt, marked when it is a word that matched the query. */
export interface ExcerptSegment {
  readonly text: string;
  readonly marked: boolean;
}

/**
 * Splits an excerpt by the answer's match ranges (UTF-16 offsets, half-open). Ranges are clamped to
 * the text; an empty, reversed or overlapping range is ignored, so a malformed answer can only
 * lose a mark, never text.
 */
export function excerptSegments(
  text: string,
  ranges: readonly TextRange[] | undefined,
): ExcerptSegment[] {
  const segments: ExcerptSegment[] = [];
  let at = 0;
  for (const range of [...(ranges ?? [])].sort((a, b) => a.start - b.start)) {
    const start = Math.max(range.start, 0);
    const end = Math.min(range.end, text.length);
    if (start < at || start >= end) {
      continue;
    }

    if (start > at) {
      segments.push({ text: text.slice(at, start), marked: false });
    }

    segments.push({ text: text.slice(start, end), marked: true });
    at = end;
  }

  if (at < text.length) {
    segments.push({ text: text.slice(at), marked: false });
  }

  return segments;
}
