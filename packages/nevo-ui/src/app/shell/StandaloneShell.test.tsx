import { renderToStaticMarkup } from 'react-dom/server';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { describe, expect, it } from 'vitest';

import { StandaloneShell } from './StandaloneShell';

describe('StandaloneShell', () => {
  it('renders product-owned headers and content inside the shared shell mechanics', () => {
    const html = renderToStaticMarkup(
      <StandaloneShell
        desktopHeader={<span>Desktop identity</span>}
        mobileHeader={<span>Mobile identity</span>}
      >
        <p>Content</p>
      </StandaloneShell>,
    );

    expect(html).toContain('standalone-shell-root');
    expect(html).toContain('data-standalone-shell-region="mobile-header"');
    expect(html).toContain('data-standalone-shell-region="desktop-header"');
    expect(html).toContain('data-standalone-shell-region="surface"');
    expect(html).toContain('data-standalone-shell-region="content"');
    expect(html).toContain('Mobile identity');
    expect(html).toContain('Desktop identity');
    expect(html).toContain('Content');
    expect(html).not.toContain('data-design-component');
    expect(html).not.toContain('data-design-capture');
  });

  it('exposes its own capture identity and deterministic slots when captured directly', () => {
    const html = renderToStaticMarkup(
      <DesignCaptureProvider captureComponents={['StandaloneShell']}>
        <StandaloneShell desktopHeader={<span>Desktop</span>} mobileHeader={<span>Mobile</span>}>
          Body
        </StandaloneShell>
      </DesignCaptureProvider>,
    );

    expect(html).toContain('data-design-component="StandaloneShell"');
    expect(html).toContain('data-design-capture="true"');
    expect(html).toContain('data-design-slot="mobileHeader"');
    expect(html).toContain('data-design-slot="desktopHeader"');
    expect(html).toContain('data-design-slot="content"');
    expect(html).not.toContain('data-design-component="AppBackground"');
    expect(html).not.toContain('data-design-component="WorkspaceSurface"');
  });
});
