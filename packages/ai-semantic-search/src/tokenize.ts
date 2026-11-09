const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Language-neutral tokenizer shared by lexical ranking and the fake embedder: Unicode letter/digit
 * runs, lower-cased, compatibility-normalized and stripped of diacritics. No stop words or stemming,
 * because the engine does not know the corpus language.
 */
export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase();

  return normalized.match(TOKEN_PATTERN) ?? [];
}
