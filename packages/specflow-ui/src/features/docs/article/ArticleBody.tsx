import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Typography } from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import type { DocsArticleResult } from '../read-model';
import { revisionOf, useDocsArticle } from '../read-model';
import { useArticleNavigation } from './articleContext';
import { DocsArticleView } from './DocsArticleView';
import { useReadingPosition } from './readingPositions';

/**
 * Why a requested document has no article. A document that is not there (removed while reading,
 * or an address to an unknown id) has one neutral message, whatever the cause.
 */
function ArticleRefusal({
  result,
  documentId,
}: {
  result: Exclude<DocsArticleResult, { kind: 'article' }>;
  documentId: string;
}) {
  const { t } = useTranslation();
  const navigation = useArticleNavigation();
  const describe = (text: string) => <span className="wrap-anywhere">{text}</span>;

  if (result.kind === 'inactive') {
    const successor = result.refusal.supersededBy;
    const superseded = result.refusal.status !== 'deprecated';

    return (
      <EmptyState
        variant="pane"
        icon="file-search"
        title={t(superseded ? 'docs.state.superseded.title' : 'docs.state.deprecated.title')}
        description={describe(
          t(
            superseded ? 'docs.state.superseded.description' : 'docs.state.deprecated.description',
            {
              id: documentId,
            },
          ),
        )}
        actions={
          successor ? (
            <Button
              variant="secondary"
              onClick={() => navigation.openDocument(successor.documentId)}
            >
              {t('docs.state.openSuccessor', { title: successor.title })}
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (result.kind === 'skipped') {
    return (
      <EmptyState
        variant="pane"
        icon="triangle-alert"
        title={t('docs.state.skipped.title')}
        description={
          <span className="grid gap-2">
            {result.refusal.skipped.map((item) => (
              <span key={item.path} className="grid gap-0.5">
                <Typography as="code" variant="code-md" className="break-all">
                  {item.path}
                </Typography>
                <span className="wrap-anywhere">{item.error}</span>
              </span>
            ))}
          </span>
        }
      />
    );
  }

  return (
    <EmptyState
      variant="pane"
      icon="file-search"
      title={t('docs.state.notAvailable')}
      description={
        <Typography as="code" variant="code-md" className="break-all">
          {documentId}
        </Typography>
      }
    />
  );
}

/**
 * The article area of one requested document: a skeleton while it loads (also while the article
 * and the tree describe different corpus revisions), the article, or why it cannot be shown.
 * Shared by the split Secondary and the stacked article screens.
 */
export function ArticleBody({
  chromeKey,
  workspaceId,
  documentId,
  sectionId,
  tree,
  entry,
}: {
  chromeKey: string;
  workspaceId: string;
  documentId: string;
  sectionId?: string;
  tree: WorkspaceDocsTree;
  /** The history entry the article is shown for: it keys the reading position. */
  entry: string;
}) {
  const { t } = useTranslation();
  const result = useDocsArticle(workspaceId, documentId);
  const position = useReadingPosition(entry);
  if (result.isError) {
    return (
      <EmptyState
        variant="pane"
        icon="circle-alert"
        title={t('docs.state.articleFailed.title')}
        description={t('docs.state.articleFailed.description')}
        actions={
          <Button variant="secondary" onClick={() => void result.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  // The article and the tree its links are resolved by must describe one corpus: while the
  // revisions are being reconciled (the older answer is refetched), the article area loads.
  if (!result.data || revisionOf(result.data) !== tree.corpusRevision) {
    return (
      <div className="p-6">
        <LoadingPresentation shape="document" label={t('docs.article.loading')} />
      </div>
    );
  }

  if (result.data.kind !== 'article') {
    return <ArticleRefusal result={result.data} documentId={documentId} />;
  }

  return (
    <DocsArticleView
      // Every history entry is its own visit: Back and Forward return to its reading position.
      key={`${workspaceId}:${documentId}:${entry}`}
      chromeKey={chromeKey}
      article={result.data.article}
      tree={tree}
      sectionId={sectionId}
      scrollMemory={position}
    />
  );
}
