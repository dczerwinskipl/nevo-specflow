import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator', () => {
  it('maps semantic tone and size to the visual marker', () => {
    const html = renderToStaticMarkup(<StatusIndicator size="md" tone="success" />);

    expect(html).toContain('bg-status-success');
    expect(html).toContain('size-status-indicator-md');
    expect(html).toContain('aria-hidden="true"');
  });

  it('supports an accessible standalone state', () => {
    const html = renderToStaticMarkup(
      <StatusIndicator aria-label="Completed" decorative={false} tone="success" />,
    );

    expect(html).toContain('aria-label="Completed"');
    expect(html).toContain('role="img"');
    expect(html).not.toContain('aria-hidden');
  });
});
