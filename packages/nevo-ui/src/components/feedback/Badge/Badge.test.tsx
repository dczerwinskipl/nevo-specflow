import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders status text', () => {
    expect(renderToStaticMarkup(<Badge>Active</Badge>)).toContain('Active');
  });

  it('uses the semantic danger status token', () => {
    expect(renderToStaticMarkup(<Badge tone="danger">Blocked</Badge>)).toContain(
      'text-status-danger',
    );
  });
});
