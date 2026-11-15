import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppWorkspace, WorkspaceHeader } from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import { ArticleBody } from '../article/ArticleBody';
import { articleActions } from '../article/articleActions';
import { ArticleTitle } from '../article/ArticleTitle';
import { useArticleSummary } from '../article/useArticleSummary';
import { NoIndexArticle } from './ReaderStates';

const splitChromeKey = 'split';

interface ArticleTarget {
  readonly workspaceId: string;
  readonly documentId: string;
  readonly tree: WorkspaceDocsTree;
}

/** The split header of an article: its title, the Contents button, Copy link and Copy path. */
function ArticleHeader({
  workspaceId,
  documentId,
  tree,
  notify,
}: ArticleTarget & { notify: (message: string) => void }) {
  const { t } = useTranslation();
  const summary = useArticleSummary(workspaceId, documentId, tree);

  return (
    <WorkspaceHeader
      headingLevel={2}
      title={summary.title}
      actions={
        summary.path
          ? articleActions({ workspaceId, documentId, path: summary.path, notify, t })
          : []
      }
      labels={{ moreActions: t('common.moreActions') }}
      identityContent={
        <ArticleTitle
          chromeKey={splitChromeKey}
          title={summary.title}
          contents={summary.contents}
        />
      }
    />
  );
}

export interface ReaderArticleAreaProps {
  readonly workspaceId: string | undefined;
  readonly workspaceName: string;
  /** The requested document, else the root index. */
  readonly documentId: string | undefined;
  /** The address names a document (a skeleton is due while it loads). */
  readonly requested: boolean;
  readonly sectionId?: string;
  readonly tree?: WorkspaceDocsTree;
  readonly treeLoading: boolean;
  readonly problem?: ReactNode;
  /** The history entry of the address: it keys the article's reading position. */
  readonly historyEntry: string;
  readonly notify: (message: string) => void;
  /** Localised texts of the plain states. */
  readonly labels: { readonly fallbackTitle: string; readonly loading: string };
}

/**
 * The split layouts' article area, an `AppWorkspace.Secondary` (the workspace accepts only its own
 * regions as children, so this builds the element rather than wrapping it): the requested
 * document, else the root index, else the plain no-index sentence; a problem of the whole
 * documentation is said here. No Close: the area always holds a document.
 */
export function readerArticleArea(props: ReaderArticleAreaProps): ReactNode {
  const { workspaceId, documentId, tree, problem, labels } = props;
  const plain = (body: ReactNode) => (
    <AppWorkspace.Secondary
      header={<WorkspaceHeader headingLevel={2} title={labels.fallbackTitle} />}
    >
      {body}
    </AppWorkspace.Secondary>
  );

  if (problem) {
    return plain(<div className="max-w-content-narrow p-6">{problem}</div>);
  }

  if (!workspaceId || !tree) {
    return plain(
      props.requested || props.treeLoading ? (
        <div className="p-6">
          <LoadingPresentation shape="document" label={labels.loading} />
        </div>
      ) : null,
    );
  }

  if (!documentId) {
    return plain(<NoIndexArticle workspaceName={props.workspaceName} />);
  }

  return (
    <AppWorkspace.Secondary
      open
      header={
        <ArticleHeader
          workspaceId={workspaceId}
          documentId={documentId}
          tree={tree}
          notify={props.notify}
        />
      }
    >
      {/* Its links open through the reader's article navigation. */}
      <ArticleBody
        chromeKey={splitChromeKey}
        workspaceId={workspaceId}
        documentId={documentId}
        sectionId={props.sectionId}
        tree={tree}
        entry={props.historyEntry}
      />
    </AppWorkspace.Secondary>
  );
}
