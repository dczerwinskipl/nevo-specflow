import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { useTranslation } from 'react-i18next';
import { useDocsArticle } from '../read-model';
import { hasContents } from './ArticleTitle';

export interface ArticleSummary {
  /** The document's title: the article's, else the tree's while it loads, else a generic name. */
  readonly title: string;
  /** The repository path, once the document is known to be readable. */
  readonly path?: string;
  /** A readable article with a Contents list (problem states have none). */
  readonly contents: boolean;
}

/**
 * What a header shows of an article: the same read as the body (one cached query), so the header
 * and the content never disagree on the document.
 */
export function useArticleSummary(
  workspaceId: string,
  documentId: string,
  tree: WorkspaceDocsTree,
): ArticleSummary {
  const { t } = useTranslation();
  const result = useDocsArticle(workspaceId, documentId);
  const listed = tree.documents.find((doc) => doc.documentId === documentId);
  const article = result.data?.kind === 'article' ? result.data.article : undefined;
  if (article) {
    return {
      title: article.document.title,
      path: `${tree.docsRoot}/${article.document.path}`,
      contents: hasContents(article.body),
    };
  }

  return {
    title: result.data === undefined && listed ? listed.title : t('docs.article.fallbackTitle'),
    contents: false,
  };
}
