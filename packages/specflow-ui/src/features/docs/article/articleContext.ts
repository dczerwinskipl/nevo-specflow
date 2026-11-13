import { createContext, useContext } from 'react';

/**
 * How the host of an article opens another document of the same workspace (a link, Related, a
 * successor): a route push on split layouts, another stacked article screen on Narrow.
 */
export interface ArticleNavigation {
  readonly workspaceId: string;
  readonly openDocument: (documentId: string, sectionId?: string) => void;
}

export const ArticleNavigationContext = createContext<ArticleNavigation | null>(null);

export function useArticleNavigation(): ArticleNavigation {
  const value = useContext(ArticleNavigationContext);
  if (!value) {
    throw new Error('useArticleNavigation must be used inside a documentation article');
  }

  return value;
}

/** The sections of the article being read: a `#section` link scrolls to its heading. */
export interface ArticleSections {
  readonly goToSection: (sectionId: string) => void;
}

export const ArticleSectionsContext = createContext<ArticleSections | null>(null);
