import { useMemo, type ComponentType, type ReactNode } from 'react';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { Link, type MarkdownDocumentImageProps, type MarkdownDocumentLinkProps } from '@nevo/ui';
import { inertImage, type InertImage } from './imagePolicy';
import { createDocsLinkIndex, resolveDocsLink, type InertLinkReason } from './linkPolicy';

/**
 * The reader's views of the references (owned by its screens). Pass a stable object, for example
 * a module constant: the renderers change only when it, the tree or the document changes.
 */
export interface DocsReferenceViews {
  readonly DocumentLink: ComponentType<{
    readonly workspaceId: string;
    readonly documentId: string;
    readonly sectionId?: string;
    readonly title?: string;
    readonly children: ReactNode;
  }>;
  readonly SectionLink: ComponentType<{
    readonly sectionId: string;
    readonly title?: string;
    readonly children: ReactNode;
  }>;
  /** Focusable inert text whose popover gives the reason (keyboard and touch). */
  readonly InertReference: ComponentType<{
    readonly inert: InertLinkReason;
    readonly children: ReactNode;
  }>;
  /** Inert alt text with an image glyph; on demand "Image not shown" and the source. */
  readonly InertImage: ComponentType<{ readonly image: InertImage }>;
}

export interface DocsReferenceRenderers {
  readonly renderLink: (props: MarkdownDocumentLinkProps) => ReactNode;
  readonly renderImage: (props: MarkdownDocumentImageProps) => ReactNode;
}

export interface DocsReferenceContext {
  readonly workspaceId: string;
  /** The tree of the same corpus as the article. */
  readonly tree: Pick<WorkspaceDocsTree, 'docsRoot' | 'documents' | 'inactive' | 'skipped'>;
  /** The document being read: its id and its path under `docs.root`. */
  readonly documentId: string;
  readonly documentPath: string;
}

/**
 * The `renderLink` and `renderImage` of `MarkdownDocument` for one article. Every link is decided
 * by the link policy; a blocked one renders a safe inert element, never `null` (which would make
 * `MarkdownDocument` fall back to its default link). Every image is inert. Both callbacks are
 * stable while the workspace, tree, document and views are, so the Markdown is not re-rendered.
 */
export function createDocsReferenceRenderers(
  context: DocsReferenceContext,
  views: DocsReferenceViews,
): DocsReferenceRenderers {
  const { DocumentLink, SectionLink, InertReference, InertImage: ImageView } = views;
  const index = createDocsLinkIndex(context.tree);
  const linkContext = {
    fromPath: context.documentPath,
    fromDocumentId: context.documentId,
    index,
  };

  return {
    renderLink: ({ children, href, title }) => {
      const target = resolveDocsLink(href, linkContext);
      switch (target.kind) {
        case 'document':
          return (
            <DocumentLink
              workspaceId={context.workspaceId}
              documentId={target.documentId}
              sectionId={target.sectionId}
              title={title}
            >
              {children}
            </DocumentLink>
          );
        case 'section':
          return (
            <SectionLink sectionId={target.sectionId} title={title}>
              {children}
            </SectionLink>
          );
        case 'external':
          return (
            <Link href={target.href} rel="noopener noreferrer" target="_blank" title={title}>
              {children}
            </Link>
          );
        case 'inert':
          return <InertReference inert={target.inert}>{children}</InertReference>;
      }
    },
    renderImage: (props) => <ImageView image={inertImage(props)} />,
  };
}

export function useDocsReferenceRenderers(
  context: DocsReferenceContext,
  views: DocsReferenceViews,
): DocsReferenceRenderers {
  const { workspaceId, tree, documentId, documentPath } = context;

  return useMemo(
    () => createDocsReferenceRenderers({ workspaceId, tree, documentId, documentPath }, views),
    [workspaceId, tree, documentId, documentPath, views],
  );
}
