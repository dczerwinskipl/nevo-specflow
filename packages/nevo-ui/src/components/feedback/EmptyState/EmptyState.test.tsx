import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';
describe('EmptyState', () => {
  it('renders title and description', () => {
    const html = renderToStaticMarkup(<EmptyState title="No data" description="Nothing yet" />);
    expect(html).toContain('No data');
    expect(html).toContain('Nothing yet');
  });
});

