/**
 * Polish-safe, case- and diacritic-insensitive text for option lookup.
 * `Intl.Collator` base sensitivity is not enough: in `pl` the letter `ł` is a distinct base letter,
 * so it is folded explicitly after stripping combining marks (`ą ć ę ń ó ś ź ż` and accents).
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLocaleLowerCase()
    .trim();
}

/** Default Combobox filter: normalised "contains" match; an empty query matches everything. */
export function defaultComboboxFilter(textValue: string, query: string): boolean {
  const needle = normalizeSearchText(query);
  return needle === '' || normalizeSearchText(textValue).includes(needle);
}
