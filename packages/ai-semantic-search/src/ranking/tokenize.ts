const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Lower-case letters without a Unicode decomposition (NFKD keeps them), folded to the ASCII letters
 * people type for them, so "platnosci" matches "płatności".
 */
const LETTER_FOLDS: Readonly<Record<string, string>> = {
  ł: 'l',
  ø: 'o',
  ß: 'ss',
  đ: 'd',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};
const FOLDED_LETTERS = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'gu');

/**
 * Language-neutral tokenizer shared by lexical ranking, the fake embedder and consumers that rank
 * with the same normalization: compatibility decomposition (NFKD), combining marks (diacritics)
 * removed, lower-cased, letters without a decomposition folded (`ł` → `l`, `ø` → `o`, `ß` → `ss`,
 * `đ` → `d`, `æ` → `ae`, `œ` → `oe`, `þ` → `th`), then Unicode letter/digit runs. "Płatności" is
 * one token, `platnosci`, so it matches "PŁATNOŚCI" and the ASCII-typed "platnosci". No stop words
 * or stemming, because the engine does not know the corpus language.
 *
 * It serves ranking only: chunk texts, ids and hashes do not depend on it, so changing it needs no
 * `CHUNKER_VERSION` bump. Section ids slug headings with the chunker's own `headingSlug`; changing
 * that does.
 */
export function tokenize(text: string): string[] {
  const normalized = text
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(FOLDED_LETTERS, (letter) => LETTER_FOLDS[letter]!);

  return normalized.match(TOKEN_PATTERN) ?? [];
}
