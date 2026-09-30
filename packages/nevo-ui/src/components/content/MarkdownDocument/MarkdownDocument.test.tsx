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

  it('allows product code to resolve Markdown links contextually', () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument
        renderLink={({ children, href }) => (
          <button data-workspace-reference={href} type="button">
            {children}
          </button>
        )}
        source={'[Open file](workspace://src/app.ts)'}
      />,
    );

    expect(html).toContain('data-workspace-reference="workspace://src/app.ts"');
    expect(html).toContain('>Open file</button>');
    expect(html).not.toContain('target="_blank"');
  });

  it('does not enable raw HTML', () => {
    const html = renderToStaticMarkup(<MarkdownDocument source={'<script>alert("x")</script>'} />);

    expect(html).not.toContain('<script>');
  });
});
