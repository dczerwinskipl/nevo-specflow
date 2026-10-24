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
