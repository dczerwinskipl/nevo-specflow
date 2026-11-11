// Query-aware excerpts of a matching section (`sections[].snippet`): what the section says about the
// question, taken from its own text (no generated summary).

import { tokenize } from '@nevo/ai-semantic-search';

/** Maximum excerpt length, ellipses included. */
export const EXCERPT_MAX_CHARS = 280;

/** Shortest words compared by prefix (`taski` / `taskami`, `session` / `sessions`). */
const PREFIX_MATCH_MIN = 4;
const FENCE = /^(?:`{3,}|~{3,})/u;
const HEADING = /^#{1,6}(?:\s|$)/u;
const LINE_ITEM = /^(?:[-*+]\s|\d+[.)]\s|\||>)/u;
const TABLE_RULE = /^\|?[\s|:-]+\|?$/u;
const SENTENCE_END = /(?<=[.!?])\s+(?=[\p{Lu}\p{N}`*_"'([])/u;
const WORD = /[\p{L}\p{N}]+/gu;

/**
 * An excerpt of `section` (markdown, heading lines included) for `query`, on one line, at most
 * `EXCERPT_MAX_CHARS` long:
 *
 * 1. The body is split into pieces: the sentences of each prose paragraph, and every line of a
 *    list, table, quote or fenced code block on its own (headings, fences and table rules dropped).
 * 2. Each piece scores the query words it contains (the shared `tokenize` normalization; words of
 *    at least four letters also match by a long common prefix, so inflected forms match), each
 *    word weighted by how few pieces of the section contain it.
 * 3. The best piece (the first on a tie) is extended with the following, then the preceding pieces
 *    while they fit; an ellipsis marks text left out before or after. A best piece longer than the
 *    bound is cut around its first matching word.
 *
 * When no piece contains a query word (a semantic-only match), the excerpt is the first pieces after
 * the heading.
 */
export function excerpt(section: string, query: string): string {
  const all = pieces(section);
  if (all.length === 0) {
    return '';
  }

  const terms = [...new Set(tokenize(query))];
  const words = all.map((piece) => tokenize(piece));
  const containing = terms.map(
    (term) => words.filter((list) => list.some((word) => matches(term, word))).length,
  );
  const weights = containing.map((count) => (count === 0 ? 0 : Math.log(1 + all.length / count)));

  let best = 0;
  let bestScore = 0;
  words.forEach((list, index) => {
    const score = terms.reduce(
      (sum, term, termIndex) =>
        list.some((word) => matches(term, word)) ? sum + weights[termIndex]! : sum,
      0,
    );
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });

  const anchor = all[best]!;
  if (anchor.length > EXCERPT_MAX_CHARS) {
    return around(anchor, bestScore > 0 ? firstMatch(anchor, terms) : 0, best > 0);
  }

  let first = best;
  let last = best;
  let length = anchor.length;
  const fits = (piece: string) => length + 1 + piece.length <= EXCERPT_MAX_CHARS - 2;
  while (last + 1 < all.length && fits(all[last + 1]!)) {
    last += 1;
    length += 1 + all[last]!.length;
  }

  while (first > 0 && fits(all[first - 1]!)) {
    first -= 1;
    length += 1 + all[first]!.length;
  }

  const text = all.slice(first, last + 1).join(' ');

  return `${first > 0 ? '…' : ''}${text}${last < all.length - 1 ? '…' : ''}`;
}

function pieces(section: string): string[] {
  const out: string[] = [];
  let paragraph: string[] = [];
  let fenced = false;
  const flush = () => {
    if (paragraph.length > 0) {
      out.push(...paragraph.join(' ').split(SENTENCE_END));
      paragraph = [];
    }
  };

  for (const raw of section.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = raw.trim().replace(/\s+/gu, ' ');
    if (FENCE.test(line)) {
      flush();
      fenced = !fenced;
    } else if (fenced) {
      if (line) {
        out.push(line);
      }
    } else if (!line || HEADING.test(line)) {
      flush();
    } else if (LINE_ITEM.test(line)) {
      flush();
      if (!TABLE_RULE.test(line)) {
        out.push(line);
      }
    } else {
      paragraph.push(line);
    }
  }

  flush();

  return out.filter((piece) => piece.length > 0);
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

/** Offset of the first word of `piece` that matches a query term. */
function firstMatch(piece: string, terms: readonly string[]): number {
  for (const match of piece.matchAll(WORD)) {
    const word = tokenize(match[0])[0];
    if (word !== undefined && terms.some((term) => matches(term, word))) {
      return match.index;
    }
  }

  return 0;
}

/** A window of an over-long piece that starts at a word boundary shortly before `offset`. */
function around(piece: string, offset: number, before: boolean): string {
  const lead = Math.floor(EXCERPT_MAX_CHARS / 4);
  let start = 0;
  if (offset > lead) {
    const space = piece.lastIndexOf(' ', offset - lead);
    start = space === -1 ? 0 : space + 1;
  }

  const prefix = before || start > 0 ? '…' : '';
  const budget = EXCERPT_MAX_CHARS - prefix.length - 1;
  const rest = piece.slice(start);
  if (rest.length <= budget + 1) {
    return `${prefix}${rest}`;
  }

  const cut = rest.slice(0, budget);
  const space = cut.lastIndexOf(' ');

  return `${prefix}${(space > budget / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
