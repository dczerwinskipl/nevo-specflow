import { describe, expect, it } from 'vitest';
import { defaultComboboxFilter, normalizeSearchText } from './filterOptions';

describe('Combobox filter', () => {
  it('ignores case and Polish diacritics, including the base letter ł', () => {
    expect(normalizeSearchText('Łódź')).toBe('lodz');
    expect(normalizeSearchText('ŻÓŁĆ ąęńśź')).toBe('zolc aensz');
    expect(defaultComboboxFilter('Łódź', 'lodz')).toBe(true);
    expect(defaultComboboxFilter('Łódź', 'ŁÓD')).toBe(true);
    expect(defaultComboboxFilter('Zielona Góra', 'gora')).toBe(true);
    expect(defaultComboboxFilter('Żary', 'ZARY')).toBe(true);
  });

  it('matches anywhere in the text and treats an empty query as all', () => {
    expect(defaultComboboxFilter('feature/combobox', 'box')).toBe(true);
    expect(defaultComboboxFilter('main', '')).toBe(true);
    expect(defaultComboboxFilter('main', '   ')).toBe(true);
    expect(defaultComboboxFilter('main', 'develop')).toBe(false);
  });
});
