const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Language-neutral tokenizer shared by lexical ranking, the fake embedder and consumers that rank
 * with the same normalization: compatibility decomposition (NFKD), combining marks (diacritics)
 * removed, lower-cased, then Unicode letter/digit runs. "Płatności" is one token, `płatnosci`, and
 * matches "platności"; letters without a decomposition (`ł`, `ø`, `ß`) stay as they are. No stop
 * words or stemming, because the engine does not know the corpus language.
 */
export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase();

  return normalized.match(TOKEN_PATTERN) ?? [];
}
