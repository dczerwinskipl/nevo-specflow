import { describe, expect, it } from 'vitest';
import { excerptSegments, parentFits, sectionPathOf } from './searchResultModel';

describe('sectionPathOf', () => {
  it('drops a leading heading equal to the title, ignoring case and extra spaces', () => {
    expect(
      sectionPathOf('AI provider boundary', [' ai  Provider boundary', 'Session identity']),
    ).toEqual({
      leaf: 'Session identity',
      full: ' ai  Provider boundary › Session identity',
    });
  });

  it('keeps a path whose first heading only resembles the title', () => {
    expect(
      sectionPathOf('Provider error and limit evidence', [
        'Claude-family errors',
        'Captured: seven-day rate-limit rejection',
      ]),
    ).toEqual({
      parent: 'Claude-family errors',
      leaf: 'Captured: seven-day rate-limit rejection',
      full: 'Claude-family errors › Captured: seven-day rate-limit rejection',
    });
  });

  it('keeps only the last two headings', () => {
    expect(sectionPathOf('AI session UX', ['Rules', 'Status', 'Session status ownership'])).toEqual(
      {
        parent: 'Status',
        leaf: 'Session status ownership',
        full: 'Rules › Status › Session status ownership',
      },
    );
  });

  it('has no line when nothing is left', () => {
    expect(sectionPathOf('AI architecture', [])).toBeUndefined();
    expect(sectionPathOf('AI architecture', ['AI Architecture'])).toBeUndefined();
  });

  it('drops only a leading duplicate', () => {
    expect(sectionPathOf('Session', ['Hierarchy', 'Session'])).toEqual({
      parent: 'Hierarchy',
      leaf: 'Session',
      full: 'Hierarchy › Session',
    });
  });
});

describe('parentFits', () => {
  const widths = { parent: 100, separator: 10, leaf: 150 };

  it('shows the parent only when it fits whole beside the whole leaf', () => {
    expect(parentFits({ ...widths, available: 260 })).toBe(true);
    expect(parentFits({ ...widths, available: 259 })).toBe(false);
  });

  it('never shows the parent before the line is measured', () => {
    expect(parentFits({ parent: 0, separator: 0, leaf: 0, available: 0 })).toBe(false);
  });
});

describe('excerptSegments', () => {
  const text = 'A Session represents a provider-backed context.';

  it('is one plain segment without ranges', () => {
    expect(excerptSegments(text, [])).toEqual([{ text, marked: false }]);
    expect(excerptSegments(text, undefined)).toEqual([{ text, marked: false }]);
  });

  it('marks up to three ranges in order', () => {
    expect(
      excerptSegments(text, [
        { start: 23, end: 31 },
        { start: 2, end: 9 },
        { start: 39, end: 46 },
      ]),
    ).toEqual([
      { text: 'A ', marked: false },
      { text: 'Session', marked: true },
      { text: ' represents a ', marked: false },
      { text: 'provider', marked: true },
      { text: '-backed ', marked: false },
      { text: 'context', marked: true },
      { text: '.', marked: false },
    ]);
  });

  it('marks ranges at both edges', () => {
    expect(
      excerptSegments('limit and limits', [
        { start: 0, end: 5 },
        { start: 10, end: 16 },
      ]),
    ).toEqual([
      { text: 'limit', marked: true },
      { text: ' and ', marked: false },
      { text: 'limits', marked: true },
    ]);
  });

  it('loses a malformed mark, never text', () => {
    expect(
      excerptSegments('abcdef', [
        { start: 1, end: 3 },
        { start: 2, end: 4 },
        { start: 5, end: 5 },
        { start: 4, end: 99 },
      ]),
    ).toEqual([
      { text: 'a', marked: false },
      { text: 'bc', marked: true },
      { text: 'd', marked: false },
      { text: 'ef', marked: true },
    ]);
  });
});
