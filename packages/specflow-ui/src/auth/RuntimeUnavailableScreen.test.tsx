import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RuntimeUnavailableView } from './RuntimeUnavailableScreen';

describe('RuntimeUnavailableScreen', () => {
  it('uses the same centered standalone workspace surface as login', () => {
    const html = renderToStaticMarkup(<RuntimeUnavailableView />);

    expect(html).toContain('bg-app-base');
    expect(html).toContain('workspace-surface-material');
    expect(html).toContain('rounded-surface');
    expect(html).toContain('border-workspace-edge');
    expect(html).toContain('items-center');
    expect(html).not.toContain('content-start');
    expect(html).toContain('Unable to connect');
    expect(html).toContain('SpecFlow Runtime did not respond.');
    expect(html).toContain('Retry');
  });
});
