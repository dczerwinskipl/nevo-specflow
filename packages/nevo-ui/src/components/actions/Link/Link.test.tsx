import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Link, linkVariants } from './Link';

describe('Link', () => {
  it('renders a native anchor with a design-editable label', () => {
    const markup = renderToStaticMarkup(<Link href="/customers">View customer</Link>);
    expect(markup).toContain('<a');
    expect(markup).toContain('href="/customers"');
    expect(markup).toContain('data-design-slot="label"');
  });

  it('keeps muted navigation visually quieter', () => {
    expect(linkVariants({ tone: 'muted' })).toContain('text-content-secondary');
  });
});

