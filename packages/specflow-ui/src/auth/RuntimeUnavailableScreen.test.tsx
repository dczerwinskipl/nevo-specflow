import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RuntimeUnavailableView } from './RuntimeUnavailableScreen';

describe('RuntimeUnavailableScreen', () => {
  it('uses the same standalone workspace shell as login', () => {
    const html = renderToStaticMarkup(<RuntimeUnavailableView />);

    expect(html).toContain('bg-app-base');
    expect(html).toContain('standalone-auth-root');
    expect(html).toContain('standalone-auth-mobile-header');
    expect(html).toContain('standalone-auth-body');
    expect(html).toContain('workspace-surface-material');
    expect(html).toContain('standalone-auth-surface');
    expect(html).toContain('border-workspace-edge');
    expect(html).toContain('standalone-auth-desktop-header');
    expect(html).toContain('Unable to connect');
    expect(html).toContain('SpecFlow Runtime did not respond.');
    expect(html).toContain('Retry');
  });
});
