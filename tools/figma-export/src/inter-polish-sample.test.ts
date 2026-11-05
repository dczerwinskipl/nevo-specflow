import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const SAMPLE_PATTERN = /document\.fonts\.load\('400 14px Inter', '([^']+)'\)/g;

/** The `unicode-range` of the `inter-latin-ext` @font-face in the design system's fonts.css. */
function latinExtendedRanges(): [number, number][] {
  const css = read('../../../packages/nevo-ui/src/design-system/fonts.css');
  const face = css.split('@font-face').find((block) => block.includes('inter-latin-ext'));
  const range = /unicode-range:([^;]+);/.exec(face ?? '')?.[1] ?? '';

  return [...range.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/g)].map(([, from, to]) => [
    parseInt(from!, 16),
    parseInt(to ?? from!, 16),
  ]);
}

describe.each([
  ['tools/figma-export/src/extract.ts', './extract.ts'],
  ['tools/storybook/.storybook/preview.ts', '../../storybook/.storybook/preview.ts'],
])('Inter preload samples in %s', (_name, path) => {
  it('loads a Polish sample whose every letter is in the Latin Extended unicode-range', () => {
    const samples = [...read(path).matchAll(SAMPLE_PATTERN)].map((match) => match[1]!);
    const polish = samples.find((sample) => sample !== 'Abc');
    expect(polish).toBe('ąćęłńóśźż');
    const ranges = latinExtendedRanges();
    expect(ranges.length).toBeGreaterThan(0);
    // ó (U+00F3) belongs to the Latin subset; every other Polish letter must need the extended one.
    for (const char of [...polish!].filter((c) => c !== 'ó')) {
      const code = char.codePointAt(0)!;
      expect(
        ranges.some(([from, to]) => code >= from && code <= to),
        char,
      ).toBe(true);
    }
  });
});
