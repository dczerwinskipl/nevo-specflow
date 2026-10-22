import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Link, linkLabelVariants, linkVariants } from './Link';

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

  it('keeps inline links exempt and gives standalone links the shared hit area', () => {
    expect(linkVariants()).not.toContain('after:');
    const standalone = linkVariants({ layout: 'standalone' });
    expect(standalone).toContain('inline-flex');
    expect(standalone).toContain('after:size-[max(100%,var(--target-size))]');
    expect(standalone).toContain('min-h-(--target-size)');
  });

  it('lays a standalone label out as a centred row that inherits the anchor gap', () => {
    const standalone = linkLabelVariants({ layout: 'standalone' });
    expect(standalone).toContain('inline-flex');
    expect(standalone).toContain('items-center');
    expect(standalone).toContain('gap-[inherit]');
    expect(linkLabelVariants({ layout: 'inline' })).toBeFalsy();
    const markup = renderToStaticMarkup(
      <Link href="/back" layout="standalone" className="gap-1.5">
        <svg aria-hidden="true" />
        Back
      </Link>,
    );
    expect(markup).toContain('data-design-slot="label"');
    expect(markup).toMatch(
      /<span[^>]*class="[^"]*inline-flex[^"]*items-center[^"]*"[^>]*data-design-slot="label"|<span[^>]*data-design-slot="label"[^>]*class="[^"]*inline-flex/,
    );
  });
});
