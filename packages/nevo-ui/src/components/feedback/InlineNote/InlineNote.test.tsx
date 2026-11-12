import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InlineNote } from './InlineNote';

describe('InlineNote', () => {
  it('is a paragraph with a decorative icon and the text', () => {
    const markup = renderToStaticMarkup(
      <InlineNote>Other specifications use this folder.</InlineNote>,
    );
    expect(markup.startsWith('<p')).toBe(true);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('Other specifications use this folder.');
    expect(markup).not.toContain('role=');
  });

  it('colours the attention icon with the status token and keeps info muted', () => {
    expect(renderToStaticMarkup(<InlineNote tone="attention">Careful</InlineNote>)).toContain(
      'text-status-attention',
    );
    expect(renderToStaticMarkup(<InlineNote>Fine</InlineNote>)).toContain('text-content-muted');
  });

  it('marks a danger note with the danger status colour', () => {
    expect(renderToStaticMarkup(<InlineNote tone="danger">Missing</InlineNote>)).toContain(
      'text-status-danger',
    );
  });

  it('can drop the icon and merges the consumer class', () => {
    const markup = renderToStaticMarkup(
      <InlineNote icon={null} className="col-start-2">
        Plain
      </InlineNote>,
    );
    expect(markup).not.toContain('<svg');
    expect(markup).toContain('col-start-2');
  });

  it('centres the icon on the first text line, also when the note wraps', () => {
    // A line-box-tall slot (1lh) at the start: one rule for one and several lines.
    const markup = renderToStaticMarkup(
      <InlineNote tone="attention">Two lines that wrap</InlineNote>,
    );
    expect(markup).toContain('items-start');
    expect(markup).toContain('flex h-[1lh] shrink-0 items-center');
    expect(markup).not.toContain('mt-0.5');
  });
});
