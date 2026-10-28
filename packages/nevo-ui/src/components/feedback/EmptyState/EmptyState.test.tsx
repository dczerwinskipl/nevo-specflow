import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    const html = renderToStaticMarkup(<EmptyState title="No data" description="Nothing yet" />);
    expect(html).toContain('No data');
    expect(html).toContain('Nothing yet');
  });

  it('keeps the bordered block by default and the consumer class', () => {
    const html = renderToStaticMarkup(<EmptyState title="No data" className="custom" />);
    expect(html).toContain('data-empty-state="default"');
    expect(html).toContain('border-border-default');
    expect(html).toContain('custom');
  });

  it('draws a borderless pane that fills its host', () => {
    const html = renderToStaticMarkup(<EmptyState variant="pane" title="No data" />);
    expect(html).toContain('data-empty-state="pane"');
    expect(html).not.toContain('border-border-default');
    expect(html).toContain('flex-1');
  });

  it('shows the icon in a decorative tile and omits empty slots', () => {
    const html = renderToStaticMarkup(<EmptyState icon="inbox" title="No data" />);
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*size-12/);
    expect(html).not.toContain('mt-2');
    expect(html).not.toContain('mt-6');
  });
});
