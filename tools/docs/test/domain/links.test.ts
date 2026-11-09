import { describe, expect, it } from 'vitest';

import type { DocRecord } from '../../src/domain/frontmatter.js';
import {
  documentAnchors,
  extractLinks,
  slugifyHeading,
  validateLinks,
} from '../../src/domain/links.js';

const doc = (file: string, body: string): DocRecord => ({ file, body });
const nothingElse = (): boolean => false;

describe('extractLinks', () => {
  it('finds inline links, images, titled links and reference definitions with body lines', () => {
    const body = [
      'See [a](a.md) and ![img](img/x.png).',
      '[titled](b.md#part "Title")',
      '[ref]: ../c.md',
    ].join('\n');

    expect(extractLinks(body)).toEqual([
      { target: 'a.md', line: 1 },
      { target: 'img/x.png', line: 1 },
      { target: 'b.md#part', line: 2 },
      { target: '../c.md', line: 3 },
    ]);
  });

  it('ignores links inside fenced code blocks and inline code', () => {
    const body = ['```md', '[x](missing.md)', '```', 'Use `[y](missing.md)` literally.'].join('\n');

    expect(extractLinks(body)).toEqual([]);
  });
});

describe('slugifyHeading and documentAnchors', () => {
  it('follows GitHub slugs: code, punctuation and link syntax removed, spaces to hyphens', () => {
    expect(slugifyHeading('5.3 Managed Session Turn')).toBe('53-managed-session-turn');
    expect(slugifyHeading('`git.commits` and [links](x.md)!')).toBe('gitcommits-and-links');
    expect(slugifyHeading('F16 — Telemetry coverage and provenance')).toBe(
      'f16--telemetry-coverage-and-provenance',
    );
    expect(slugifyHeading('Kontekst: kto używa')).toBe('kontekst-kto-używa');
  });

  it('suffixes duplicate headings and includes explicit HTML anchors', () => {
    const anchors = documentAnchors(
      ['# Setup', '## Setup', '```', '# Not a heading', '```', '<a id="custom"></a>'].join('\n'),
    );

    expect([...anchors].sort()).toEqual(['custom', 'setup', 'setup-1']);
  });
});

describe('validateLinks', () => {
  const target = doc('docs/a/target.md', '# Target\n\n## Known part\n');

  it('accepts corpus documents, existing paths, own anchors and external links', () => {
    const source = doc(
      'docs/b/source.md',
      [
        '# Source',
        '[t](../a/target.md#known-part)',
        '[self](#source)',
        '[dir](../a/)',
        '[pkg](/packages/x/README.md)',
        '[web](https://example.com/missing.md) [mail](mailto:a@b.c)',
      ].join('\n'),
    );
    const exists = (p: string): boolean => p === 'docs/a' || p === 'packages/x/README.md';

    expect(validateLinks([target, source], exists)).toEqual([]);
  });

  it('reports missing files, missing headings and links that leave the repository', () => {
    const source = doc(
      'docs/source.md',
      ['[gone](gone.md)', '[part](a/target.md#unknown)', '[up](../../outside.md)'].join('\n'),
    );

    expect(validateLinks([target, source], nothingElse)).toEqual([
      "docs/source.md (body line 1): broken link 'gone.md' (no such file or directory)",
      "docs/source.md (body line 2): broken link 'a/target.md#unknown' (no heading '#unknown')",
      "docs/source.md (body line 3): link '../../outside.md' points outside the repository",
    ]);
  });

  it('does not check fragments of files outside the scanned corpus', () => {
    const source = doc('docs/source.md', '[gen](index.generated.md#anything)');
    const exists = (p: string): boolean => p === 'docs/index.generated.md';

    expect(validateLinks([source], exists)).toEqual([]);
  });

  it('decodes percent-encoded paths before resolving them', () => {
    const spaced = doc('docs/with space.md', '# Hi\n');
    const source = doc('docs/source.md', '[s](with%20space.md#hi)');

    expect(validateLinks([spaced, source], nothingElse)).toEqual([]);
  });
});
