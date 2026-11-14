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
const separator = /[-_/.]/g;

export function nameTruncation(name: string): NameTruncation {
  return /\s/.test(name) ? 'end' : 'middle';
}

/**
 * The end of an identifier-like name kept whole when it is cut in the middle: the last segment
 * after a separator (`-`, `_`, `/`, `.`) with its separator, plus the segment before it when the
 * last is shorter than 6 characters; at most 16 characters (the end of a longer segment). A name
 * without a separator is one segment.
 */
export function distinguishingTail(name: string): string {
  const cuts = [...name.matchAll(separator)].map((match) => match.index);
  const last = cuts.at(-1);
  if (last === undefined) {
    return name.slice(-maxTailLength);
  }

  const lastSegment = name.length - last - 1;
  const previous = cuts.at(-2);
  if (lastSegment < shortSegmentLength && previous !== undefined) {
    const withPrevious = name.slice(previous);
    if (withPrevious.length <= maxTailLength) {
      return withPrevious;
    }
  }

  return name.slice(Math.max(last, name.length - maxTailLength));
}

/**
 * The name as shown in `available` pixels, cut in the middle: `head + "…" + tail` with the longest
 * head that fits, where `measure` gives a text's rendered width. The whole name when it fits. When
 * not even one head character fits beside the tail, the tail itself loses characters from its
 * start (its end is what tells names apart).
 */
export function fitMiddle(
  name: string,
  available: number,
  measure: (text: string) => number,
): string {
  if (measure(name) <= available) {
    return name;
  }

  const tail = distinguishingTail(name);
  const headRoom = name.length - tail.length;
  const head = longestFitting(headRoom, (length) =>
    fits(`${name.slice(0, length)}${nameEllipsis}${tail}`),
  );
  if (head > 0) {
    return `${name.slice(0, head)}${nameEllipsis}${tail}`;
  }

  const kept = longestFitting(tail.length, (length) =>
    fits(`${nameEllipsis}${tail.slice(tail.length - length)}`),
  );

  return `${nameEllipsis}${tail.slice(tail.length - kept)}`;

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
