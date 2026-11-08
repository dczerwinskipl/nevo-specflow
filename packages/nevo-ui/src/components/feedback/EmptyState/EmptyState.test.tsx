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

  it('draws the glyph alone, large and muted: xl in a pane, lg in a block, no tile', () => {
    const pane = renderToStaticMarkup(<EmptyState variant="pane" icon="inbox" title="No data" />);
    expect(pane).toContain('size-icon-xl');
    expect(pane).toContain('text-content-muted');
    expect(pane).not.toContain('rounded-composite');
    expect(pane).not.toContain('bg-surface-subtle');
    const block = renderToStaticMarkup(<EmptyState icon="inbox" title="No data" />);
    expect(block).toContain('size-icon-lg');
    const smaller = renderToStaticMarkup(
      <EmptyState variant="pane" icon="inbox" iconSize="lg" title="No data" />,
    );
    expect(smaller).toContain('size-icon-lg');
  });

  it('draws an inline section body: borderless, row-sized, start-aligned, control-sized glyph', () => {
    const html = renderToStaticMarkup(
      <EmptyState variant="inline" icon="list-checks" title="No tasks" description="Later" />,
    );
    expect(html).toContain('data-empty-state="inline"');
    expect(html).toContain('flex-row');
    expect(html).toContain('text-left');
    expect(html).toContain('size-icon-md');
    expect(html).not.toContain('border-border-default');
    expect(html).not.toContain('min-h-');
    expect(html).not.toContain('text-center');
    expect(html).not.toContain('text-title-md');
    // Illustration sizes do not apply to the inline glyph.
    expect(
      renderToStaticMarkup(<EmptyState variant="inline" icon="inbox" iconSize="xl" title="x" />),
    ).toContain('size-icon-md');
  });

  it('draws an inline state without a glyph as the text alone', () => {
    const html = renderToStaticMarkup(
      <EmptyState variant="inline" title="No tasks" description="Later" />,
    );
    expect(html).not.toContain('aria-hidden');
    expect(html).not.toContain('size-icon-');
    expect(html).toContain('No tasks');
    expect(html).toContain('Later');
  });

  it('takes a custom illustration element in place of the glyph', () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={<span data-illustration="true" />} title="No data" />,
    );
    expect(html).toContain('data-illustration="true"');
    expect(html).not.toContain('size-icon-');
  });

  it('omits empty slots', () => {
    const html = renderToStaticMarkup(<EmptyState title="No data" />);
    expect(html).not.toContain('mt-2');
    expect(html).not.toContain('mt-6');
  });
});
