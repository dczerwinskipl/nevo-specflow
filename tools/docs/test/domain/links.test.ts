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
const lines = (...l: string[]): string => l.join('\n');

describe('extractLinks', () => {
  it('finds inline links, images, titled links and reference definitions with body lines', () => {
    const body = lines(
      'See [a](a.md) and ![img](img/x.png).',
      '[titled](b.md#part "Title")',
      '[ref]: ../c.md',
    );

    expect(extractLinks(body)).toEqual([
      { target: 'a.md', line: 1 },
      { target: 'img/x.png', line: 1 },
      { target: 'b.md#part', line: 2 },
      { target: '../c.md', line: 3 },
    ]);
  });

  it('ignores links inside fenced code blocks and inline code', () => {
    const body = lines('```md', '[x](missing.md)', '```', 'Use `[y](missing.md)` literally.');

    expect(extractLinks(body)).toEqual([]);
  });

  it('skips footnote definitions but keeps angle-bracket and parenthesised targets', () => {
    const body = lines('[^1]: See the other section.', '[a](<with space.md>) [b](foo_(bar).md)');

    expect(extractLinks(body).map((l) => l.target)).toEqual(['with space.md', 'foo_(bar).md']);
  });

  it('strips CommonMark fences (indented, longer, unclosed) and HTML comments', () => {
    const body = lines(
      '1. Step',
      '   ```md',
      '   [a](missing-1.md)',
      '   ```',
      '````md',
      '```',
      '[b](missing-2.md)',
      '```',
      '````',
      '<!-- [c](missing-3.md) -->',
      '[kept](kept.md)',
      '~~~',
      '[d](missing-4.md)',
    );

    expect(extractLinks(body).map((l) => l.target)).toEqual(['kept.md']);
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

  it('drops emphasis and decodes entities but keeps snake_case', () => {
    expect(slugifyHeading('The _real_ thing')).toBe('the-real-thing');
    expect(slugifyHeading('A &amp; B')).toBe('a--b');
    expect(slugifyHeading('read **snake_case** keys')).toBe('read-snake_case-keys');
  });

  it('suffixes duplicate headings and includes explicit HTML anchors', () => {
    const anchors = documentAnchors(
      lines('# Setup', '## Setup', '```', '# Not a heading', '```', '<a id="custom"></a>'),
    );

    expect([...anchors].sort()).toEqual(['custom', 'setup', 'setup-1']);
  });

  it('finds indented ATX and setext headings and keeps duplicate suffixes unique', () => {
    const anchors = documentAnchors(
      lines('   ## Indented', '', 'Setext title', '===', '', '# foo', '# foo', '# foo-1'),
    );

    expect([...anchors].sort()).toEqual(['foo', 'foo-1', 'foo-1-1', 'indented', 'setext-title']);
  });

  it('reads HTML anchors in any attribute order and quote style, but not inside code', () => {
    const anchors = documentAnchors(
      lines('<a href="z" id="w"></a>', "<a name='x'></a>", '```', '<a id="in-code"></a>', '```'),
    );

    expect([...anchors].sort()).toEqual(['w', 'x']);
  });
});

describe('validateLinks', () => {
  const target = doc('docs/a/target.md', '# Target\n\n## Known part\n');

  it('accepts corpus documents, existing paths, own anchors and external links', () => {
    const source = doc(
      'docs/b/source.md',
      lines(
        '# Source',
        '[t](../a/target.md#known-part)',
        '[self](#source)',
        '[dir](../a/)',
        '[pkg](/packages/x/README.md)',
        '[web](https://example.com/missing.md) [mail](mailto:a@b.c)',
      ),
    );
    const exists = (p: string): boolean => p === 'docs/a' || p === 'packages/x/README.md';

    expect(validateLinks([target, source], exists)).toEqual([]);
  });

  it('reports missing files, missing headings and links that leave the repository', () => {
    const source = doc(
      'docs/source.md',
      lines('[gone](gone.md)', '[part](a/target.md#unknown)', '[up](../../outside.md)'),
    );

    expect(validateLinks([target, source], nothingElse)).toEqual([
      "docs/source.md (body line 1): broken link 'gone.md' (no such file or directory)",
      "docs/source.md (body line 2): broken link 'a/target.md#unknown' (no heading '#unknown')",
      "docs/source.md (body line 3): link '../../outside.md' points outside the repository",
    ]);
  });

  it('rejects backslashes and reports a case mismatch with an indexed document', () => {
    const source = doc('docs/source.md', lines('[b](a\\target.md)', '[c](A/Target.md#known-part)'));

    expect(validateLinks([target, source], nothingElse)).toEqual([
      "docs/source.md (body line 1): link 'a\\target.md' uses a backslash; use '/' separators",
      "docs/source.md (body line 2): broken link 'A/Target.md#known-part' (case differs from 'docs/a/target.md')",
    ]);
  });

  it('keeps inline code text in heading anchors, as GitHub does', () => {
    const coded = doc('docs/coded.md', '## Use `openWorkflow` and `inspectExecution`\n');
    const source = doc('docs/source.md', '[d](coded.md#use-openworkflow-and-inspectexecution)');

    expect(validateLinks([coded, source], nothingElse)).toEqual([]);
  });

  it('ignores query strings and decodes reserved characters', () => {
    const source = doc('docs/source.md', '[q](a/target.md?plain=1#known%2Dpart)');

    expect(validateLinks([target, source], nothingElse)).toEqual([]);
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
