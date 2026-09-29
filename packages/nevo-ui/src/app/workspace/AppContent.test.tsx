import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppContentContainer } from './AppContent';

describe('AppContentContainer', () => {
  it('authors a preferred width and clamps it to the workspace slot', () => {
    const html = renderToStaticMarkup(
      <AppContentContainer align="start" size="wide">
        Content
      </AppContentContainer>,
    );

    expect(html).toContain('w-content-wide');
    expect(html).toContain('max-w-full');
    expect(html).not.toContain('mx-auto');
  });

  it('uses the standard centered content width by default', () => {
    const html = renderToStaticMarkup(<AppContentContainer>Content</AppContentContainer>);

    expect(html).toContain('w-content-standard');
    expect(html).toContain('mx-auto');
  });
});

