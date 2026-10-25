import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownDocument } from './MarkdownDocument';

describe('MarkdownDocument', () => {
  it('embeds headings below an owning title without changing their visual styles', () => {
    const source = '# Section\n\n## Subsection\n\n###### Deep section';
    const standalone = renderToStaticMarkup(<MarkdownDocument source={source} />);
    const embedded = renderToStaticMarkup(<MarkdownDocument source={source} headingOffset={1} />);
    expect(standalone).toContain('<h1');
    expect(embedded).not.toContain('<h1');
    expect(embedded).toContain('<h2');
    expect(embedded).toContain('<h3');
    expect(embedded).toContain('<h6');
    expect(embedded.match(/class="[^"]*"/g)).toEqual(standalone.match(/class="[^"]*"/g));
  });
  it('hides HTML comments and keeps any other raw HTML as text', () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument
        source={'## Goal\n\n<!-- Initial goal; refine it. -->\n\nDescribe it.\n\n<b>bold</b>'}
      />,
    );
    expect(html).not.toContain('Initial goal');
    expect(html).toContain('Describe it.');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
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
        source={'[Open file](./src/app.ts)'}
      />,
    );

    expect(html).toContain('data-workspace-reference="./src/app.ts"');
    expect(html).toContain('>Open file</button>');
    expect(html).not.toContain('target="_blank"');
  });

  it('falls back to the shared external link when the product renderer does not claim a link', () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument
        renderLink={({ href }) =>
          href?.startsWith('./') ? <button type="button">Local</button> : undefined
        }
        source={'[Docs](https://example.com)'}
      />,
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('>Docs</');
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

describe('MarkdownDocument source lines', () => {
  const source =
    '# Title\n\nParagraph\n\n- one\n- two\n  - nested\n\n```ts\nconst a = 1;\n```\n\n| A |\n| - |\n| 1 |\n\n> quote\n';

  it('is off by default and leaves the markup untouched', () => {
    const off = renderToStaticMarkup(<MarkdownDocument source={source} />);
    expect(off).not.toContain('data-source-line');
  });

  it('adds the start line to top-level blocks and list items only when opted in', () => {
    const on = renderToStaticMarkup(<MarkdownDocument source={source} sourceLines />);
    expect(on).toMatch(/<h1[^>]*data-source-line="1"/);
    expect(on).toMatch(/<p[^>]*data-source-line="3"/);
    expect(on).toMatch(/<ul[^>]*data-source-line="5"/);
    expect(on).toMatch(/<li[^>]*data-source-line="5"/);
    expect(on).toMatch(/<li[^>]*data-source-line="6"/);
    expect(on).toMatch(/<li[^>]*data-source-line="7"/);
    // The code block scrolls in a ScrollArea region that carries the line.
    expect(on).toMatch(/<div[^>]*data-source-line="9"/);
    expect(on).toMatch(/data-source-line="13"/);
    expect(on).toMatch(/<blockquote[^>]*data-source-line="17"/);
    // Nested non-item blocks do not carry a line (only top-level blocks and li).
    expect((on.match(/<ul/g) ?? []).length).toBe(2);
    expect((on.match(/<ul[^>]*data-source-line/g) ?? []).length).toBe(1);
  });

  it('keeps the rendered classes identical to the default output', () => {
    const strip = (html: string) => html.replace(/ data-source-line="\d+"/g, '');
    expect(strip(renderToStaticMarkup(<MarkdownDocument source={source} sourceLines />))).toBe(
      renderToStaticMarkup(<MarkdownDocument source={source} />),
    );
  });

  it('puts wide tables and code blocks in named, focusable horizontal scroll regions', () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument
        labels={{ table: 'Tabela', codeBlock: 'Blok kodu' }}
        source={['| A | B |', '| :- | -: |', '| 1 | 2 |', '', '```ts', 'const a = 1;', '```'].join(
          String.fromCharCode(10),
        )}
      />,
    );
    expect(html).toContain('aria-label="Tabela"');
    expect(html).toContain('aria-label="Blok kodu"');
    expect(html.match(/role="group"/g)).toHaveLength(2);
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(html).toContain('text-align:right');
  });

  it('keeps images within the column', () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument source={'![Alt](https://example.com/a.png)'} />,
    );
    expect(html).toContain('max-w-full');
    expect(html).toContain('alt="Alt"');
  });
});
