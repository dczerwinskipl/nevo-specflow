import { describe, expect, it } from 'vitest';

import { deriveDocumentTitle, fileStem } from './document-title';

describe('fileStem', () => {
  it.each([
    ['a/b.md', 'b'],
    ['b.v2.md', 'b.v2'],
    ['noext', 'noext'],
    ['dir/.hidden', '.hidden'],
    ['x/y/Report.TXT', 'Report'],
  ])('%s -> %s', (path, stem) => {
    expect(fileStem(path)).toBe(stem);
  });
});

describe('deriveDocumentTitle', () => {
  it('takes the first level-1 heading of markdown', () => {
    expect(deriveDocumentTitle('a.md', 'intro\n\n# The title\n\n# Second\n')).toBe('The title');
  });

  it('strips closing hashes and surrounding space', () => {
    expect(deriveDocumentTitle('a.md', '#   Spaced ##  \n')).toBe('Spaced');
  });

  it('ignores deeper headings and headings in fenced code', () => {
    expect(
      deriveDocumentTitle('a.md', '## Not\n```\n# code\n```\n~~~\n# tilde\n~~~\n# Real\n'),
    ).toBe('Real');
  });

  it('skips a frontmatter block and does not read it as headings', () => {
    const text = '---\nid: x\n# a comment\ntitle: "Ignored"\n---\n\n# Body title\n';
    expect(deriveDocumentTitle('overview.md', text)).toBe('Body title');
  });

  it('keeps a leading --- that never closes as ordinary text', () => {
    expect(deriveDocumentTitle('a.md', '---\n# After rule\n')).toBe('After rule');
  });

  it('falls back to the file stem without a heading, for other kinds and without text', () => {
    expect(deriveDocumentTitle('notes/ideas.md', 'no heading')).toBe('ideas');
    expect(deriveDocumentTitle('notes/ideas.txt', '# Not markdown')).toBe('ideas');
    expect(deriveDocumentTitle('pic.png', undefined)).toBe('pic');
    expect(deriveDocumentTitle('a.md', '#\n')).toBe('a');
  });

  it('handles CRLF and a BOM', () => {
    expect(deriveDocumentTitle('a.md', String.fromCharCode(0xfeff) + '# Title\r\nbody\r\n')).toBe(
      'Title',
    );
  });

  it('treats an uppercase extension as markdown', () => {
    expect(deriveDocumentTitle('A.MD', '# Up')).toBe('Up');
  });
});

describe('deriveDocumentTitle: bounded work and length', () => {
  const budgetMs = 50;
  const NL = String.fromCharCode(10);
  const timed = (work: () => unknown): number => {
    const started = performance.now();
    work();

    return performance.now() - started;
  };

  it.each([
    ['a 200k-space line after #', '#' + ' '.repeat(200_000) + 'x' + NL],
    ['a 200k-space tail after a title', '# T' + ' '.repeat(200_000) + 'x' + NL],
    ['a 1 MiB line of spaces and tabs', '# ' + ' \t'.repeat(512 * 1024) + NL],
    ['a 1 MiB line of hashes', '# a ' + '#'.repeat(1024 * 1024) + 'b' + NL],
    ['a 1 MiB title', '# ' + 'a'.repeat(1024 * 1024) + NL],
  ])('takes linear time on %s', (_name, text) => {
    expect(timed(() => deriveDocumentTitle('a.md', text))).toBeLessThan(budgetMs);
  });

  it('caps the derived title at 200 characters without splitting a code point', () => {
    expect(deriveDocumentTitle('a.md', '# ' + 'a'.repeat(5000))).toHaveLength(200);
    const emoji = String.fromCodePoint(0x1f600);
    const title = deriveDocumentTitle('a.md', '# ' + emoji.repeat(500));
    expect([...title]).toHaveLength(200);
    expect(title).toBe(emoji.repeat(200));
  });

  it('still strips a closing run of hashes only after a space', () => {
    expect(deriveDocumentTitle('a.md', '# Title ##' + NL)).toBe('Title');
    expect(deriveDocumentTitle('a.md', '# C#' + NL)).toBe('C#');
    expect(deriveDocumentTitle('a.md', '# ##' + NL)).toBe('a');
    expect(deriveDocumentTitle('a.md', '#NoSpace' + NL)).toBe('a');
    expect(deriveDocumentTitle('a.md', '    # four spaces' + NL)).toBe('a');
  });
});
