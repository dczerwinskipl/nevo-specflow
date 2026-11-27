import * as lucide from 'lucide-react';
import { iconRegistry } from '@nevo/ui';
import { describe, expect, it } from 'vitest';
import lint from './productGlyphs.json';
import { documentTypeIcon, documentTypeIcons, productIcons } from './productIcons';

type Glyph = (typeof documentTypeIcons)[keyof typeof documentTypeIcons];

const dictionary: Glyph[] = [
  ...Object.values(productIcons).flatMap((entry) =>
    'item' in entry ? [entry.item, entry.collection] : [entry],
  ),
  ...Object.values(documentTypeIcons),
];
const byName = lucide as unknown as Record<string, Glyph | undefined>;

describe('the product icon dictionary', () => {
  it('gives every concept its own glyph: no glyph means two things', () => {
    expect(new Set(dictionary).size).toBe(dictionary.length);
  });

  it('lists exactly its glyphs for the lint rule, so none can be imported around it', () => {
    const listed = lint.glyphs.map((name) => byName[name]);

    expect(listed.every(Boolean)).toBe(true);
    expect(new Set(listed)).toEqual(new Set(dictionary));
    expect(lint.glyphs).toHaveLength(dictionary.length);
  });

  it('lists every Icon registry name of a dictionary or retired glyph for the lint rule', () => {
    const guarded = new Set([...dictionary, ...lint.retired.map((name) => byName[name])]);
    const names = Object.entries(iconRegistry)
      .filter(([, glyph]) => guarded.has(glyph))
      .map(([name]) => name);

    expect(new Set(lint.registryNames)).toEqual(new Set(names));
  });

  it('resolves a document type icon by its definition name and ignores unknown names', () => {
    expect(documentTypeIcon('telescope')).toBe(documentTypeIcons.telescope);
    expect(documentTypeIcon('book-open')).toBeUndefined();
    expect(documentTypeIcon('toString')).toBeUndefined();
    expect(documentTypeIcon(undefined)).toBeUndefined();
  });
});
