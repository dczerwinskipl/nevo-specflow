import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownDocument } from './MarkdownDocument';

describe('MarkdownDocument', () => {
  it('supports GFM and safe external links', () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument
        source={'[Open](https://example.com)\n\n- [x] Done\n\n| A | B |\n| - | - |\n| 1 | 2 |'}
      />,
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Completed task"');
    expect(html).toContain('<table');
  });

  it('does not enable raw HTML', () => {
    const html = renderToStaticMarkup(<MarkdownDocument source={'<script>alert("x")</script>'} />);

    expect(html).not.toContain('<script>');
  });

  it('allows generated task labels to be localized', () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument
        labels={{ completedTask: 'Zadanie ukończone', incompleteTask: 'Zadanie nieukończone' }}
        source={'- [x] Done\n- [ ] Pending'}
      />,
    );

    expect(html).toContain('aria-label="Zadanie ukończone"');
    expect(html).toContain('aria-label="Zadanie nieukończone"');
  });
});
