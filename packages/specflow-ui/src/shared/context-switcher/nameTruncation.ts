/**
 * How a context's name is cut on the switcher's one-line trigger. Identifier-like names (no
 * whitespace: workspaces, branches) are cut in the middle so their distinguishing end stays
 * visible (worktrees often differ only there); prose names (a Specification title) are cut at the
 * end.
 */
export type NameTruncation = 'middle' | 'end';

export const nameEllipsis = '…';

/** The longest distinguishing end kept whole, separator included. */
const maxTailLength = 16;
/** A last segment shorter than this keeps the segment before it too (`-docs-v2`, not `-v2`). */
const shortSegmentLength = 6;
const separators = new Set(['-', '_', '/', '.']);
const graphemeSegmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

/**
 * The name as user-perceived characters (grapheme clusters), so a cut never splits a surrogate
 * pair (an emoji) or leaves a combining mark (a decomposed accent) without its base letter.
 */
function graphemes(name: string): string[] {
  return Array.from(graphemeSegmenter.segment(name), ({ segment }) => segment);
}

export function nameTruncation(name: string): NameTruncation {
  return /\s/.test(name) ? 'end' : 'middle';
}

/**
 * The end of an identifier-like name kept whole when it is cut in the middle: the last segment
 * after a separator (`-`, `_`, `/`, `.`) with its separator, plus the segment before it when the
 * last is shorter than 6 characters; at most 16 characters (the end of a longer segment). A name
 * without a separator is one segment. Characters are grapheme clusters.
 */
export function distinguishingTail(name: string): string {
  return tailOf(graphemes(name)).join('');
}

function tailOf(characters: readonly string[]): readonly string[] {
  const cuts = characters.flatMap((character, index) => (separators.has(character) ? [index] : []));
  const last = cuts.at(-1);
  if (last === undefined) {
    return characters.slice(-maxTailLength);
  }

  const lastSegment = characters.length - last - 1;
  const previous = cuts.at(-2);
  if (lastSegment < shortSegmentLength && previous !== undefined) {
    const withPrevious = characters.slice(previous);
    if (withPrevious.length <= maxTailLength) {
      return withPrevious;
    }
  }

  return characters.slice(Math.max(last, characters.length - maxTailLength));
}

/**
 * The name as shown in `available` pixels, cut in the middle: `head + "…" + tail` with the longest
 * head that fits, where `measure` gives a text's rendered width. The whole name when it fits. When
 * not even one head character fits beside the tail, the tail itself loses characters from its
 * start (its end is what tells names apart). Every cut falls between grapheme clusters.
 */
export function fitMiddle(
  name: string,
  available: number,
  measure: (text: string) => number,
): string {
  if (measure(name) <= available) {
    return name;
  }

  const characters = graphemes(name);
  const tailCharacters = tailOf(characters);
  const tail = tailCharacters.join('');
  const headText = (length: number) => characters.slice(0, length).join('');
  const head = longestFitting(characters.length - tailCharacters.length, (length) =>
    fits(`${headText(length)}${nameEllipsis}${tail}`),
  );
  if (head > 0) {
    return `${headText(head)}${nameEllipsis}${tail}`;
  }

  const tailText = (length: number) =>
    tailCharacters.slice(tailCharacters.length - length).join('');
  const kept = longestFitting(tailCharacters.length, (length) =>
    fits(`${nameEllipsis}${tailText(length)}`),
  );

  return `${nameEllipsis}${tailText(kept)}`;

  function fits(text: string) {
    return measure(text) <= available;
  }
}

/** The largest length in `0..max` for which `fits` holds (monotonic: shorter always fits better). */
function longestFitting(max: number, fits: (length: number) => boolean): number {
  let low = 0;
  let high = max;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}
