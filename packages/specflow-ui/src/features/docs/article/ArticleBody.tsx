import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Typography } from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import type { DocsArticleResult } from '../read-model';
import { useDocsArticle } from '../read-model';
import { useArticleNavigation } from './articleContext';
import { DocsArticleView, type ArticleScrollMemory } from './DocsArticleView';

/** Why a requested document has no article (the refusals and a document gone while reading). */
function ArticleRefusal({
  result,
  documentId,
  workspaceName,
  removed,
}: {
  result: Exclude<DocsArticleResult, { kind: 'article' }>;
  documentId: string;
  workspaceName: string;
  /** The document was in the tree when it was opened: it went away while reading. */
  removed: boolean;
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
      title={t(removed ? 'docs.state.removed.title' : 'docs.state.notFound.title')}
      description={describe(
        t(removed ? 'docs.state.removed.description' : 'docs.state.notFound.description', {
          id: documentId,
          workspace: workspaceName,
        }),
      )}
    />
  );
}

/**
 * The article area of one requested document: a skeleton while it loads, the article, or why it
 * cannot be shown. Shared by the split Secondary and the stacked article screens.
 */
export function ArticleBody({
  chromeKey,
  workspaceId,
  workspaceName,
  documentId,
  sectionId,
  tree,
  fromReader,
  scrollMemory,
}: {
  chromeKey: string;
  workspaceId: string;
  workspaceName: string;
  documentId: string;
  sectionId?: string;
  tree: WorkspaceDocsTree;
  fromReader: boolean;
  scrollMemory?: ArticleScrollMemory;
}) {
  const { t } = useTranslation();
  const result = useDocsArticle(workspaceId, documentId);
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

  if (!result.data) {
    return (
      <div className="p-6">
        <LoadingPresentation shape="document" label={t('docs.article.loading')} />
      </div>
    );
  }

  if (result.data.kind !== 'article') {
    return (
      <ArticleRefusal
        result={result.data}
        documentId={documentId}
        workspaceName={workspaceName}
        removed={fromReader}
      />
    );
  }

  return (
    <DocsArticleView
      key={`${workspaceId}:${documentId}`}
      chromeKey={chromeKey}
      article={result.data.article}
      tree={tree}
      sectionId={sectionId}
      scrollMemory={scrollMemory}
    />
  );
}
