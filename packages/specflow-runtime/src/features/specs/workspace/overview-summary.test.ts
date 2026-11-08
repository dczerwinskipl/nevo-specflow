import { describe, expect, it } from 'vitest';

import { OVERVIEW_SUMMARY_MAX_GRAPHEMES, summarizeOverview } from './overview-summary';

describe('summarizeOverview', () => {
  it('returns the first paragraph after front matter and the H1 as plain text', () => {
    expect(
      summarizeOverview(
        '---\ntitle: SSO\ncreated: 2026-11-08\n---\n# Logowanie SSO\n\nLogowanie przez **firmowego** dostawcę.\nDruga linia.\n\nNext paragraph.',
      ),
    ).toBe('Logowanie przez firmowego dostawcę. Druga linia.');
  });

  it('drops HTML, images, headings, code and tables; links keep their text', () => {
    const markdown = [
      '# Title',
      '<!-- a\nmulti-line comment -->',
      '<div align="center">',
      '![logo](logo.png)',
      '</div>',
      '',
      '## Goal',
      '',
      '```ts',
      'const notProse = true;',
      '```',
      '',
      '    indented code',
      '',
      '| Column | Other |',
      '| ------ | ----- |',
      '| cell   | cell  |',
      '',
      'Read the [guide](https://example.com) and `run` the _tool_ ~~now~~ with <b>care</b>.',
    ].join('\n');

    expect(summarizeOverview(markdown)).toBe('Read the guide and run the tool now with care.');
  });

  it('removes list and quote markers and keeps identifiers with underscores', () => {
    expect(summarizeOverview('> Quoted\n> text\n')).toBe('Quoted text');
    expect(summarizeOverview('- first item\n- [x] second item\n')).toBe('first item second item');
    expect(summarizeOverview('Keep snake_case_name and 2 * 3 * 4.')).toBe(
      'Keep snake_case_name and 2 * 3 * 4.',
    );
  });

  it('treats a setext heading as a heading', () => {
    expect(summarizeOverview('Title\n=====\n\nBody text.')).toBe('Body text.');
  });

  it('is empty for a document without prose', () => {
    expect(summarizeOverview('')).toBe('');
    expect(summarizeOverview('# Only a title\n')).toBe('');
    expect(summarizeOverview('---\nunterminated: front matter\n')).toBe('');
    expect(summarizeOverview('```\nunterminated code\n')).toBe('');
    expect(summarizeOverview('<!-- unterminated comment\ntext')).toBe('');
  });

  it('collapses whitespace and cuts long text at a word boundary', () => {
    const summary = summarizeOverview('word   '.repeat(200));

    expect(OVERVIEW_SUMMARY_MAX_GRAPHEMES).toBe(320);
    expect(summary.length).toBeLessThanOrEqual(OVERVIEW_SUMMARY_MAX_GRAPHEMES);
    expect(summary.length).toBeGreaterThan(OVERVIEW_SUMMARY_MAX_GRAPHEMES - 'word '.length - 1);
    expect(summary.endsWith('word…')).toBe(true);
    expect(summary).not.toMatch(/\s{2}/u);
  });

  it('cuts a single unbroken word hard', () => {
    const summary = summarizeOverview('x'.repeat(1000));

    expect(summary).toHaveLength(OVERVIEW_SUMMARY_MAX_GRAPHEMES);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('counts graphemes, never splitting one', () => {
    const summary = summarizeOverview('👩‍💻'.repeat(400));
    const graphemes = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(summary),
    ].map((part) => part.segment);

    expect(graphemes).toHaveLength(OVERVIEW_SUMMARY_MAX_GRAPHEMES);
    expect(graphemes.slice(0, -1).every((grapheme) => grapheme === '👩‍💻')).toBe(true);
    expect(graphemes.at(-1)).toBe('…');
    expect(summarizeOverview('👩‍💻'.repeat(320))).toBe('👩‍💻'.repeat(320));
  });
});
