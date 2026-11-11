import { describe, expect, it } from 'vitest';

import {
  CHUNKER_VERSION,
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_CHARS,
  chunkMarkdownUnit,
  splitMarkdownSections,
} from './markdown-chunker';
import type { SourceUnit } from './chunk';

function unit(text: string, header = 'Title: Guide'): SourceUnit {
  return { id: 'guide', contentHash: 'h', text, header, metadata: { kind: 'guide' } };
}

/** A paragraph of `words` distinct words on one line. */
const paragraph = (words: number, prefix = 'p') =>
  Array.from({ length: words }, (_, index) => `${prefix}${index}`).join(' ');

describe('chunkMarkdownUnit', () => {
  it('splits on headings and keeps the heading path, section id and line', () => {
    const chunks = chunkMarkdownUnit(
      unit(
        [
          'Intro text.',
          '# Guide',
          'Overview.',
          '## Install',
          'Run it.',
          '### Windows',
          'Use PowerShell.',
          '## Usage ##',
          'Call it.',
        ].join('\n'),
      ),
    );

    expect(chunks.map((chunk) => [chunk.id, chunk.headingPath, chunk.startLine])).toEqual([
      ['guide#_top', [], 1],
      ['guide#guide', ['Guide'], 2],
      ['guide#guide/install', ['Guide', 'Install'], 4],
      ['guide#guide/install/windows', ['Guide', 'Install', 'Windows'], 6],
      ['guide#guide/usage', ['Guide', 'Usage'], 8],
    ]);
    expect(chunks[2]!.sectionId).toBe('guide/install');
    expect(chunks[2]!.text).toBe('## Install\nRun it.');
    expect(chunks[2]!.embeddingText).toBe('Title: Guide\n\nGuide > Install\n\n## Install\nRun it.');
    expect(chunks[2]!.metadata).toEqual({ kind: 'guide' });
  });

  it('ignores headings in fenced code, skips empty sections and numbers repeated paths', () => {
    const chunks = chunkMarkdownUnit(
      unit(
        [
          '# A',
          '## Empty',
          '',
          '## Notes',
          '````sh',
          '# not a heading',
          '```',
          '# still not a heading',
          '````',
          '## Notes',
          'Second notes.',
        ].join('\n'),
      ),
    );

    expect(chunks.map((chunk) => chunk.id)).toEqual(['guide#a/notes', 'guide#a/notes~2']);
    expect(chunks[0]!.text).toContain('# still not a heading');
  });

  it('slugs section ids with the shared tokenizer and keeps empty sections addressable', () => {
    const sections = splitMarkdownSections('# Zarządzanie taskami!\n## Empty\n## —\ntext');

    expect(sections.map((section) => [section.id, section.startLine])).toEqual([
      ['zarzadzanie-taskami', 1],
      ['zarzadzanie-taskami/empty', 2],
      ['zarzadzanie-taskami/section', 3],
    ]);
  });

  it('derives a section id from its parent id, so repeated headings keep their children', () => {
    const sections = splitMarkdownSections(
      '# API\n## Endpoint\nx\n## Endpoint\ny\n### Error handling\nz\n## Errors\nw',
    );

    expect(sections.map((section) => [section.id, section.parentId])).toEqual([
      ['api', undefined],
      ['api/endpoint', 'api'],
      ['api/endpoint~2', 'api'],
      ['api/endpoint~2/error-handling', 'api/endpoint~2'],
      ['api/errors', 'api'],
    ]);
  });

  it('splits a long section on block boundaries and never cuts a table or code block that fits', () => {
    const table = [
      '| Route | Purpose |',
      '| --- | --- |',
      ...Array.from({ length: 30 }, (_, i) => `| /r${i} | does ${i} |`),
    ].join('\n');
    const code = [
      '```ts',
      ...Array.from({ length: 30 }, (_, i) => `const v${i} = ${i};`),
      '',
      'export {};',
      '```',
    ].join('\n');
    const items = Array.from(
      { length: 12 },
      (_, i) => `- item ${i}: ${paragraph(8, `i${i}w`)}`,
    ).join('\n');
    const body = [
      paragraph(150, 'a'),
      table,
      paragraph(150, 'b'),
      code,
      items,
      paragraph(150, 'c'),
    ];
    const chunks = chunkMarkdownUnit(unit(`## Routes\n\n${body.join('\n\n')}`));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.id)).toEqual(
      chunks.map((_, index) => `guide#routes:${index + 1}`),
    );
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk.sectionId).toBe('routes');
    }

    expect(chunks.filter((chunk) => chunk.text.includes(table))).toHaveLength(1);
    expect(chunks.filter((chunk) => chunk.text.includes(code))).toHaveLength(1);
    expect(chunks.find((chunk) => chunk.text.includes('- item 0:'))!.text).toContain('- item 11:');
    // Block-packed parts do not overlap: every block appears once.
    expect(chunks.map((chunk) => chunk.text).join('\n\n')).toBe(
      `## Routes\n\n${body.join('\n\n')}`,
    );
  });

  it('cuts only a single oversize block into overlapping windows, starting at words', () => {
    const words = paragraph(900, 'word');
    const chunks = chunkMarkdownUnit(unit(`# Big\n${words}\n# Small\nTiny.`));
    const big = chunks.filter((chunk) => chunk.headingPath[0] === 'Big');

    expect(big.length).toBeGreaterThan(1);
    expect(big[0]!.text.startsWith('# Big\nword0 ')).toBe(true);
    for (const chunk of big) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk.text).toMatch(/^(?:# Big|word\d+ )/u);
    }

    const overlap = big[0]!.text.slice(-CHUNK_OVERLAP_CHARS / 2);
    expect(big[1]!.text).toContain(overlap);
    expect(chunks.at(-1)!.id).toBe('guide#small');
  });

  it('starts a window overlap at a line start, so a table row is repeated whole, and gives parts their line', () => {
    const rows = Array.from(
      { length: 120 },
      (_, index) => `| /route/${index} | purpose ${index} |`,
    );
    const chunks = chunkMarkdownUnit(unit(['# T', '', 'Intro.', '', ...rows].join('\n')));

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.startLine).toBe(1);
    for (const chunk of chunks.slice(1)) {
      expect(chunk.text).toMatch(/^\| \/route\/\d+ \|/u);
      const row = Number(/^\| \/route\/(\d+)/u.exec(chunk.text)![1]);
      expect(chunk.startLine).toBe(5 + row);
    }
  });

  it('keeps ids and hashes of unchanged sections stable, and hashes include the header', () => {
    const before = chunkMarkdownUnit(unit('# A\nOne.\n# B\nTwo.'));
    const after = chunkMarkdownUnit(unit('# New\nInserted.\n# A\nOne.\n# B\nChanged.'));
    const header = chunkMarkdownUnit(unit('# A\nOne.\n# B\nTwo.', 'Title: Renamed'));

    const a = (chunks: typeof before) => chunks.find((chunk) => chunk.id === 'guide#a')!;
    const b = (chunks: typeof before) => chunks.find((chunk) => chunk.id === 'guide#b')!;
    expect(a(after).contentHash).toBe(a(before).contentHash);
    expect(b(after).contentHash).not.toBe(b(before).contentHash);
    expect(a(header).contentHash).not.toBe(a(before).contentHash);
    expect(CHUNKER_VERSION).toBeGreaterThan(0);
  });
});
