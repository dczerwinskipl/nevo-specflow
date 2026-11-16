import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppContentContainer, AppContentScrollProvider, AppWorkspaceBody } from './AppContent';

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

  it('is the named page content container that AccentBlock bleed="narrow" queries', () => {
    expect(renderToStaticMarkup(<AppContentContainer>Content</AppContentContainer>)).toContain(
      '@container/app-content',
    );
  });
});

describe('AppWorkspaceBody inline padding variable', () => {
  it.each([
    ['md', '--spacing(4)'],
    ['sm', '--spacing(3)'],
    ['none', '0px'],
  ] as const)('exposes the %s inline padding as --app-body-padding-inline', (padding, value) => {
    for (const scroll of ['native', 'area'] as const) {
      const markup = renderToStaticMarkup(
        <AppWorkspaceBody padding={padding} scroll={scroll}>
          Content
        </AppWorkspaceBody>,
      );
      expect(markup).toContain(`[--app-body-padding-inline:${value}]`);
      expect(markup.includes('px-(--app-body-padding-inline)')).toBe(padding !== 'none');
    }
  });
});

describe('AppWorkspaceBody scroll ownership', () => {
  it('uses the shared ScrollArea when requested by a desktop surface', () => {
    const markup = renderToStaticMarkup(
      <AppWorkspaceBody scroll="area" aria-label="Materials">
        Content
      </AppWorkspaceBody>,
    );
    expect(markup).toContain('scroll-area-viewport');
    expect(markup).toContain('scroll-area-indicator-bottom');
    expect(markup).toContain('aria-label="Materials"');
  });
  it('refines the padded content box of the ScrollArea with contentClassName', () => {
    const markup = renderToStaticMarkup(
      <AppWorkspaceBody scroll="area" contentClassName="py-6">
        Content
      </AppWorkspaceBody>,
    );
    expect(markup).toContain('scroll-area-content');
    expect(markup).toMatch(/scroll-area-content[^"]*p-4 [^"]*py-6/);
  });
  it('keeps contentClassName on the native body when the body owns no scroll area', () => {
    const markup = renderToStaticMarkup(
      <AppWorkspaceBody contentClassName="py-6">Content</AppWorkspaceBody>,
    );
    expect(markup).toContain('py-6');
    expect(markup).not.toContain('scroll-area-viewport');
  });
  it('leaves scrolling to the stacked workspace host', () => {
    const markup = renderToStaticMarkup(
      <AppContentScrollProvider>
        <AppWorkspaceBody scroll="area">Content</AppWorkspaceBody>
      </AppContentScrollProvider>,
    );
    expect(markup).not.toContain('scroll-area-viewport');
    expect(markup).toContain('Content');
    expect(markup).not.toContain('tabindex');
  });
});
