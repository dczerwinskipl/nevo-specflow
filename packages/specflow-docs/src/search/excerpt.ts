// Query-aware excerpts of a matching section (`sections[].snippet` and `snippetMatches`): what the
// section says about the question, as plain text taken from its own text (no generated summary),
// with the query's words located in it.

import { tokenize } from '@nevo/ai-semantic-search';
import type { DocsSearchTextRange } from '@nevo/specflow-contracts/docs';

import { fragments, type Fragment, type Sentence } from './excerpt-fragments';

/** Maximum excerpt length, ellipses included. */
export const EXCERPT_MAX_CHARS = 280;
/** Most characters of an excerpt before its first match, so the match is on its first line. */
export const EXCERPT_LEAD_CHARS = 40;
/** Most matched words located in an excerpt. */
export const EXCERPT_MAX_MATCHES = 3;

/** Shortest words compared by prefix (`taski` / `taskami`, `session` / `sessions`). */
const PREFIX_MATCH_MIN = 4;
const CUT_START = '… ';
const CUT_END = '…';
/** A word as the query terms are matched against it; combining marks stay in the word. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;

export interface Excerpt {
  /** Plain text on one line, at most `EXCERPT_MAX_CHARS` long. */
  readonly text: string;
  /** The first word of `text` matching each query term, at most `EXCERPT_MAX_MATCHES`, in order. */
  readonly matches: DocsSearchTextRange[];
}

/**
 * An excerpt of `section` (markdown, heading lines included) for `query`:
 *
 * 1. The section is read as fragments (`excerpt-fragments.ts`): paragraphs, list items, table rows
 *    and code lines as plain text, split into sentences classified as prose or code.
 * 2. Each sentence scores the query words it contains (the shared `tokenize` normalization; words
 *    of at least four letters also match by a long common prefix, so inflected forms match), each
 *    word weighted by how few sentences of the section contain it. The best prose sentence (the
 *    first on a tie) is the anchor; a code sentence only when no prose sentence matches.
 * 3. The excerpt is a window of the anchor's fragment: it starts at the anchor sentence's start
 *    when that is at most `EXCERPT_LEAD_CHARS` before its first match, or else at a word cut so
 *    that `"… "` and the text before the match fit that lead. It ends at the fragment's end, or at the
 *    last sentence end that fits, or else at a word with `"…"`.
 *
 * When no sentence contains a query word (a match by meaning, or in a heading or the frontmatter),
 * the excerpt is the section's longest prose fragment from its start.
 */
export function excerpt(section: string, query: string): Excerpt {
  const all = fragments(section);
  const terms = [...new Set(tokenize(query))];
  const anchor = bestSentence(all, terms);
  const text =
    anchor === undefined
      ? longestProse(all)
      : // The anchor scored, so it has a matching word (`words`).
        around(
          anchor.fragment,
          anchor.sentence,
          firstMatch(anchor.fragment.text, anchor.sentence, terms)!,
        );

  return { text, matches: matchRanges(text, terms) };
}

function bestSentence(
  all: readonly Fragment[],
  terms: readonly string[],
): { readonly fragment: Fragment; readonly sentence: Sentence } | undefined {
  const units = all.flatMap((fragment) =>
    fragment.sentences.map((sentence) => ({
      fragment,
      sentence,
      words: words(fragment.text.slice(sentence.start, sentence.end)).flatMap(
        (word) => word.tokens,
      ),
    })),
  );
  const containing = terms.map(
    (term) => units.filter((unit) => unit.words.some((word) => matches(term, word))).length,
  );
  const weights = containing.map((count) => (count === 0 ? 0 : Math.log(1 + units.length / count)));
  const scored = units.map((unit) => ({
    ...unit,
    score: terms.reduce(
      (sum, term, index) =>
        unit.words.some((word) => matches(term, word)) ? sum + weights[index]! : sum,
      0,
    ),
  }));
  const best = (code: boolean) =>
    scored.reduce<(typeof scored)[number] | undefined>(
      (top, unit) => (unit.sentence.code === code && unit.score > (top?.score ?? 0) ? unit : top),
      undefined,
    );

  return best(false) ?? best(true);
}

/** The longest fragment with a prose sentence (any fragment when none has), from its start. */
function longestProse(all: readonly Fragment[]): string {
  const prose = all.filter((fragment) => fragment.sentences.some((sentence) => !sentence.code));
  const longest = (prose.length > 0 ? prose : all).reduce<Fragment | undefined>(
    (best, fragment) =>
      best === undefined || fragment.text.length > best.text.length ? fragment : best,
    undefined,
  );

  return longest === undefined ? '' : window(longest, 0, '', 0);
}

/** The window of `fragment` around the anchor sentence's first match, `match`. */
function around(
  fragment: Fragment,
  anchor: Sentence,
  match: { readonly start: number; readonly end: number },
): string {
  if (match.start - anchor.start <= EXCERPT_LEAD_CHARS) {
    return window(fragment, anchor.start, '', match.end);
  }

  // A cut: the first whole word that leaves room for the ellipsis within the lead.
  const { text } = fragment;
  let start = match.start - (EXCERPT_LEAD_CHARS - CUT_START.length);
  while (start < match.start && !/\s/u.test(text[start - 1]!)) {
    start += 1;
  }

  return window(fragment, start, CUT_START, match.end);
}

/**
 * `fragment.text` from `start`, after `prefix`, ending at the fragment's end, the last sentence end
 * that fits (and keeps `keep`), or a word followed by `"…"`.
 */
function window(fragment: Fragment, start: number, prefix: string, keep: number): string {
  const { text } = fragment;
  const room = EXCERPT_MAX_CHARS - prefix.length;
  if (text.length - start <= room) {
    return `${prefix}${text.slice(start)}`;
  }

  const sentenceEnd = fragment.sentences
    .filter(({ end }) => end > start && end >= keep && end - start <= room)
    .at(-1);
  if (sentenceEnd !== undefined) {
    return `${prefix}${text.slice(start, sentenceEnd.end)}`;
  }

  const cut = text.slice(start, start + room - CUT_END.length);
  const space = cut.lastIndexOf(' ');
  const body = space > cut.length / 2 && start + space >= keep ? cut.slice(0, space) : cut;

  return `${prefix}${body.trimEnd()}${CUT_END}`;
}

/** The first word of `sentence` that matches a query term, as offsets into `text`. */
function firstMatch(
  text: string,
  sentence: Sentence,
  terms: readonly string[],
): { readonly start: number; readonly end: number } | undefined {
  const word = words(text.slice(sentence.start, sentence.end)).find(({ tokens }) =>
    tokens.some((token) => terms.some((term) => matches(term, token))),
  );

  return word && { start: sentence.start + word.start, end: sentence.start + word.end };
}

/**
 * The words of `text` holding the first match of each term, at most `EXCERPT_MAX_MATCHES`. Words are
 * taken from `text` itself and normalized one by one, so the ranges cover the original characters
 * whatever `tokenize` folds (`płatności` for `platnosci`, `ß` for `ss`).
 */
function matchRanges(text: string, terms: readonly string[]): DocsSearchTextRange[] {
  const left = new Set(terms);
  const ranges: DocsSearchTextRange[] = [];
  for (const { start, end, tokens } of words(text)) {
    if (ranges.length === EXCERPT_MAX_MATCHES || left.size === 0) {
      break;
    }

    const found = [...left].filter((term) => tokens.some((token) => matches(term, token)));
    if (found.length > 0) {
      found.forEach((term) => left.delete(term));
      ranges.push({ start, end });
    }
  }

  return ranges;
}

/**
 * The words of `text` with their offsets and normalized tokens. Scoring, the window and the ranges
 * all match through it, so a sentence that scores always has a word to locate.
 */
function words(text: string): { start: number; end: number; tokens: string[] }[] {
  return [...text.matchAll(WORD)].map((word) => ({
    start: word.index,
    end: word.index + word[0].length,
    tokens: tokenize(word[0]),
  }));
}

/** The same word, or two words of at least four letters sharing all but their last two letters. */
function matches(term: string, word: string): boolean {
  if (term === word) {
    return true;
  }

  const shorter = Math.min(term.length, word.length);
  if (shorter < PREFIX_MATCH_MIN) {
    return false;
  }

  let common = 0;
  while (common < shorter && term[common] === word[common]) {
    common += 1;
  }

  return common >= Math.max(PREFIX_MATCH_MIN, shorter - 2);
}
