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

  it('can drop the icon and merges the consumer class', () => {
    const markup = renderToStaticMarkup(
      <InlineNote icon={null} className="col-start-2">
        Plain
      </InlineNote>,
    );
    expect(markup).not.toContain('<svg');
    expect(markup).toContain('col-start-2');
  });
});
