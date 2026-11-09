import { describe, expect, it } from 'vitest';

import {
  CHUNKER_VERSION,
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_CHARS,
  chunkMarkdownUnit,
} from './markdown-chunker';
import type { SourceUnit } from './ports';

function unit(text: string, header = 'Title: Guide'): SourceUnit {
  return { id: 'guide', contentHash: 'h', text, header, metadata: { kind: 'guide' } };
}

describe('chunkMarkdownUnit', () => {
  it('splits on headings and keeps the heading path', () => {
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

    expect(chunks.map((chunk) => [chunk.id, chunk.headingPath])).toEqual([
      ['guide#', []],
      ['guide#Guide', ['Guide']],
      ['guide#Guide > Install', ['Guide', 'Install']],
      ['guide#Guide > Install > Windows', ['Guide', 'Install', 'Windows']],
      ['guide#Guide > Usage', ['Guide', 'Usage']],
    ]);
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
          '```sh',
          '# not a heading',
          '```',
          '## Notes',
          'Second notes.',
        ].join('\n'),
      ),
    );

    expect(chunks.map((chunk) => chunk.id)).toEqual(['guide#A > Notes', 'guide#A > Notes~2']);
    expect(chunks[0]!.text).toContain('# not a heading');
  });

  it('keeps ids unique when headings spell the suffixes literally', () => {
    const big = Array.from({ length: 900 }, (_, index) => `w${index}`).join(' ');
    const chunks = chunkMarkdownUnit(
      unit(['# A', 'x', '# A', 'y', '# A~2', 'z', `# B`, big, '# B/1', 'q'].join('\n')),
    );
    const ids = chunks.map((chunk) => chunk.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(['guide#A', 'guide#A~2', 'guide#A~2~2', 'guide#B/1', 'guide#B/1~2']),
    );
  });

  it('splits an oversize section into overlapping parts within the bound', () => {
    const words = Array.from({ length: 900 }, (_, index) => `word${index}`).join(' ');
    const chunks = chunkMarkdownUnit(unit(`# Big\n${words}\n# Small\nTiny.`));
    const big = chunks.filter((chunk) => chunk.headingPath[0] === 'Big');

    expect(big.length).toBeGreaterThan(1);
    expect(big.map((chunk) => chunk.id)).toEqual(big.map((_, index) => `guide#Big/${index + 1}`));
    for (const chunk of big) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }

    const overlap = big[0]!.text.slice(-CHUNK_OVERLAP_CHARS / 2);
    expect(big[1]!.text).toContain(overlap);
    expect(chunks.at(-1)!.id).toBe('guide#Small');
  });

  it('keeps ids and hashes of unchanged sections stable, and hashes include the header', () => {
    const before = chunkMarkdownUnit(unit('# A\nOne.\n# B\nTwo.'));
    const after = chunkMarkdownUnit(unit('# New\nInserted.\n# A\nOne.\n# B\nChanged.'));
    const header = chunkMarkdownUnit(unit('# A\nOne.\n# B\nTwo.', 'Title: Renamed'));

    const a = (chunks: typeof before) => chunks.find((chunk) => chunk.id === 'guide#A')!;
    const b = (chunks: typeof before) => chunks.find((chunk) => chunk.id === 'guide#B')!;
    expect(a(after).contentHash).toBe(a(before).contentHash);
    expect(b(after).contentHash).not.toBe(b(before).contentHash);
    expect(a(header).contentHash).not.toBe(a(before).contentHash);
    expect(CHUNKER_VERSION).toBeGreaterThan(0);
  });
});
