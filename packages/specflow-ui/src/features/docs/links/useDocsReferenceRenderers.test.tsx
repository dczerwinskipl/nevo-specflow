// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { isValidElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DocsReferenceViews } from './useDocsReferenceRenderers';
import { useDocsReferenceRenderers } from './useDocsReferenceRenderers';

afterEach(cleanup);

const views: DocsReferenceViews = {
  DocumentLink: ({ documentId, children }) => <a href={`#/${documentId}`}>{children}</a>,
  SectionLink: ({ sectionId, children }) => <a href={`#${sectionId}`}>{children}</a>,
  InertReference: ({ inert, children }) => <button data-reason={inert.reason}>{children}</button>,
  InertImage: ({ image }) => <span data-source={image.source}>{image.alt}</span>,
};

const tree = {
  docsRoot: 'docs',
  documents: [
    {
      documentId: 'a',
      title: 'A',
      type: 'guide',
      status: 'current',
      path: 'a.md',
      summary: '',
      nonAuthoritative: false,
    },
  ],
  inactive: [],
  skipped: [],
};
const context = { workspaceId: 'w', tree, documentId: 'a', documentPath: 'a.md' };

describe('documentation reference renderers', () => {
  it('stay the same callbacks while the workspace, tree, document and views do', () => {
    const { result, rerender } = renderHook((props) => useDocsReferenceRenderers(props, views), {
      initialProps: context,
    });
    const first = result.current;
    rerender({ ...context });
    expect(result.current.renderLink).toBe(first.renderLink);
    expect(result.current.renderImage).toBe(first.renderImage);
    rerender({ ...context, documentId: 'b', documentPath: 'b.md' });
    expect(result.current.renderLink).not.toBe(first.renderLink);
  });

  it('renders a blocked link and every image as a safe inert element, never null', () => {
    const { result } = renderHook(() => useDocsReferenceRenderers(context, views));
    const blocked = result.current.renderLink({ children: 'x', href: 'javascript:alert(1)' });
    expect(isValidElement(blocked)).toBe(true);

    render(
      <>
        {blocked}
        {result.current.renderLink({ children: 'site', href: 'https://example.com' })}
        {result.current.renderImage({ alt: 'Flow', src: 'https://example.com/a.png' })}
      </>,
    );
    expect(screen.getByRole('button', { name: 'x' }).dataset.reason).toBe('unsafe-scheme');
    const external = screen.getByRole('link', { name: 'site' });
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');
    expect(external.getAttribute('target')).toBe('_blank');
    expect(document.querySelector('img')).toBeNull();
    expect(
      (result.current.renderImage({ alt: 'Flow' }) as ReactElement<{ image: unknown }>).props.image,
    ).toEqual({ alt: 'Flow' });
  });
});
