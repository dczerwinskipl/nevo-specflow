// @vitest-environment jsdom
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MarkdownDocument } from '@nevo/ui';
import {
  markdownOutline,
  outlineColumnMinWidth,
  outlineColumnWidth,
  outlineTextMinWidth,
  outlineTextWidth,
} from './markdownOutline';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(cleanup);
const doc = (...lines: string[]) => lines.join('\n');

describe('markdown outline', () => {
  it('reads ATX headings of level 1 to 4 with their lines and drops deeper ones', () => {
    expect(
      markdownOutline(doc('# One', '', '## Two ##', '### Three', '#### Four', '##### Five')),
    ).toEqual([
      { line: 1, level: 1, text: 'One' },
      { line: 3, level: 2, text: 'Two' },
      { line: 4, level: 3, text: 'Three' },
      { line: 5, level: 4, text: 'Four' },
    ]);
  });

  it('reads setext headings', () => {
    expect(markdownOutline(doc('Title', '=====', '', 'Section', '-------', 'text'))).toEqual([
      { line: 1, level: 1, text: 'Title' },
      { line: 4, level: 2, text: 'Section' },
    ]);
  });

  it('ignores headings inside fenced code and a thematic break under a blank line', () => {
    expect(
      markdownOutline(
        doc(
          '# Real',
          '```md',
          '# not a heading',
          '```',
          '',
          'text',
          '',
          '---',
          '~~~',
          '## no',
          '~~~',
        ),
      ),
    ).toEqual([{ line: 1, level: 1, text: 'Real' }]);
  });

  it('strips inline markup and skips empty headings', () => {
    expect(markdownOutline(doc('## The `code` and **bold** [link](http://x)', '##'))).toEqual([
      { line: 1, level: 2, text: 'The code and bold link' },
    ]);
  });

  it('has nothing for a document without headings', () => {
    expect(markdownOutline(doc('just text', '', '- a list'))).toEqual([]);
    expect(markdownOutline('')).toEqual([]);
  });

  it('points at the same lines the preview marks on its rendered headings', () => {
    const source = doc(
      '# One',
      '',
      'text',
      '',
      '## Two',
      '',
      'Setext',
      '------',
      '',
      '```',
      '# no',
      '```',
      '',
      '### Three',
    );
    const { container } = render(createElement(MarkdownDocument, { source, sourceLines: true }));
    const rendered = [...container.querySelectorAll<HTMLElement>('h1,h2,h3,h4')].map((heading) => [
      Number(heading.dataset.sourceLine),
      heading.textContent,
    ]);
    expect(markdownOutline(source).map((heading) => [heading.line, heading.text])).toEqual(
      rendered,
    );
  });
});

describe('contents column geometry', () => {
  it('is 28% of the panel between 240 and 320 px', () => {
    expect(outlineColumnWidth(840)).toBe(240);
    expect(outlineColumnWidth(860)).toBe(241);
    expect(outlineColumnWidth(877)).toBe(246);
    expect(outlineColumnWidth(700)).toBe(240);
    expect(outlineColumnWidth(1290)).toBe(320);
    expect(outlineColumnWidth(4000)).toBe(320);
  });

  it('leaves the text at least 520 px (about 65 characters) from the threshold up', () => {
    expect(outlineColumnMinWidth).toBe(840);
    for (const width of [840, 847, 860, 870, 877, 879, 900, 922, 997, 1035, 1100, 1290])
      expect(outlineTextWidth(width)).toBeGreaterThanOrEqual(outlineTextMinWidth);
    expect(outlineTextWidth(820)).toBeLessThan(outlineTextWidth(840));
  });
});
