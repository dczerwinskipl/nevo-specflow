import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useRouter } from '@tanstack/react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { AppWorkspace, WorkspaceHeader, useWorkspaceCapabilities } from '@nevo/ui';
import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { ApplicationSessionBack } from '../../../app/navigation/ApplicationLocation';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { useNotify } from '../../../shared/notifications/notifications';
import { ArticleChromeContext, createArticleChromeStore } from '../article/articleChrome';
import { ArticleNavigationContext, type ArticleNavigation } from '../article/articleContext';
import { ArticleStackControlContext } from '../article/articleStack';
import { currentDocsWorkspace } from '../current-workspace/currentWorkspaceStore';
import type { CurrentDocsWorkspace } from '../current-workspace/useCurrentDocsWorkspace';
import { docsFailure } from '../read-model';
import { DocsTreePane } from '../tree-pane/DocsTreePane';
import { displayPath } from '../workspace-picker/workspacePickerModel';
import { WorkspacePicker } from '../workspace-picker/WorkspacePicker';
import { readerArticleArea } from './ReaderArticleArea';
import { CorpusProblemView, DocsForbidden, type CorpusProblem } from './ReaderStates';
import {
  hashOfSection,
  historyEntryOf,
  readerAddress,
  sectionFromHash,
  sessionOf,
  type DocsReaderLocationState,
} from './readerLocation';
import { useNarrowArticleStack } from './useNarrowArticleStack';

/**
 * The documentation reader of one workspace: the tree pane as Primary (capped at 360 px) and the
 * read-only article as Secondary on split layouts; on Narrow the tree is the first screen and the
 * article is pushed over it. Every opened document is a route push, at every width: the address
 * always names the document being read.
 */
export function DocsReader({
  current,
  workspaceId,
  documentId,
  hash,
  entry,
  historyEntry,
  tree,
}: {
  current: CurrentDocsWorkspace;
  /** The settled workspace the address names; `undefined` while it is being resolved. */
  workspaceId: string | undefined;
  documentId: string | undefined;
  hash: string | undefined;
  entry: DocsReaderLocationState | undefined;
  /** The history entry of the address (it keys reading positions and the Narrow stack). */
  historyEntry: string;
  tree: UseQueryResult<WorkspaceDocsTree>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const notify = useNotify();
  const workspaceLabels = useWorkspaceLabels();
  const { supportsSplit, measured } = useWorkspaceCapabilities();
  const [chrome] = useState(createArticleChromeStore);
  const list = current.workspaces.data;
  const workspace = current.workspace;
  const projectFolder = list?.workspaces.find((item) => item.workspaceId === list.projectFolderId);
  const workspaceName = workspace?.name ?? '';
  const sectionId = hash === undefined ? undefined : sectionFromHash(hash);
  const session = useMemo(
    () => sessionOf(entry),
    // The way back is two strings; the entry object changes with every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry?.sessionId, entry?.sessionTitle],
  );
  const sessionId = session.sessionId;
  const openedFrom = entry?.openedFrom;

  // Split layouts show the root index for the workspace's own address: it is the current document.
  const rootIndexShown = supportsSplit ? tree.data?.rootIndexDocumentId : undefined;
  // Stable while the workspace, the way back and the layout are: it is a dependency of the
  // article's links. The entry it is opened from is read when it is opened.
  const openDocument = useCallback(
    (target: string, section: string | undefined, link: boolean) => {
      if (!workspaceId) {
        return;
      }

      const from = router.state.location;
      const shown = readerAddress(from.pathname)?.documentId ?? rootIndexShown;
      // The document and section already shown: nothing to open, no second history entry.
      if (target === shown && section === sectionFromHash(from.hash)) {
        return;
      }

      void navigate({
        to: '/workspaces/$workspaceId/docs/$documentId',
        params: { workspaceId, documentId: target },
        hash: hashOfSection(section),
        state: {
          docsReader: {
            ...session,
            openedFrom: {
              entry: historyEntryOf(from.state),
              documentId: readerAddress(from.pathname)?.documentId,
              link,
            },
          },
        },
      });
    },
    [navigate, router, workspaceId, session, rootIndexShown],
  );
  const openFromList = useCallback(
    (target: string, section?: string) => openDocument(target, section, false),
    [openDocument],
  );
  // Links, Related and a successor of an article, on every layout.
  const articleNavigation = useMemo<ArticleNavigation | null>(
    () =>
      workspaceId
        ? {
            workspaceId,
            openDocument: (target, section) => openDocument(target, section, true),
          }
        : null,
    [workspaceId, openDocument],
  );

  const pick = (next: string) => {
    if (next === workspaceId) {
      return;
    }

    currentDocsWorkspace.pick(next);
    const title = tree.data?.documents.find((doc) => doc.documentId === documentId)?.title;
    const state = {
      docsReader: {
        source: 'pick' as const,
        ...session,
        ...(title ? { notInWorkspace: title } : {}),
      },
    };
    void navigate(
      documentId === undefined
        ? { to: '/workspaces/$workspaceId/docs', params: { workspaceId: next }, state }
        : {
            to: '/workspaces/$workspaceId/docs/$documentId',
            params: { workspaceId: next, documentId },
            state,
          },
    );
  };

  const leaveDocument = () => {
    if (!workspaceId) {
      return;
    }

    // Opened from the tree's entry: Back steps there instead of adding a second tree entry. An
    // address opened directly, or from another article (after a reload or a resize), is replaced
    // by the tree's.
    if (openedFrom && openedFrom.documentId === undefined) {
      router.history.back();

      return;
    }

    void navigate({
      to: '/workspaces/$workspaceId/docs',
      params: { workspaceId },
      state: { docsReader: session },
      replace: true,
    });
  };

  const failure = tree.error ? docsFailure(tree.error) : undefined;
  const listFailure = current.workspaces.error ? docsFailure(current.workspaces.error) : undefined;
  const problem: CorpusProblem | undefined =
    failure && failure.kind !== 'forbidden'
      ? failure
      : tree.data?.documents.length === 0
        ? { kind: 'empty' }
        : listFailure && listFailure.kind !== 'forbidden'
          ? listFailure
          : undefined;
  const retry = () => {
    void current.workspaces.refetch();
    void tree.refetch();
  };

  const narrowArticle = useMemo(() => {
    if (!workspaceId || !documentId || !tree.data) {
      return undefined;
    }

    return {
      root: {
        workspaceId,
        documentId,
        sectionId,
        title:
          tree.data.documents.find((doc) => doc.documentId === documentId)?.title ??
          t('docs.article.fallbackTitle'),
        entry: historyEntry,
      },
      openedFrom,
    };
  }, [workspaceId, documentId, sectionId, tree.data, historyEntry, openedFrom, t]);
  const stackControl = useNarrowArticleStack({
    article: problem ? undefined : narrowArticle,
    onLeave: leaveDocument,
  });

  if (failure?.kind === 'forbidden' || listFailure?.kind === 'forbidden') {
    return <DocsForbidden />;
  }

  const notices = [
    ...(current.notice && projectFolder
      ? [
          current.notice.reason === 'unavailable'
            ? t('docs.notice.unavailable', {
                name: current.notice.workspaceName,
                projectFolder: projectFolder.name,
              })
            : t('docs.notice.notRegistered', { projectFolder: projectFolder.name }),
        ]
      : []),
    ...(entry?.notInWorkspace && entry.source === undefined
      ? [t('docs.notice.notInWorkspace', { title: entry.notInWorkspace, workspace: workspaceName })]
      : []),
  ];
  const folder = workspace ? displayPath(workspace.path, projectFolder?.path) : '';
  const problemView = problem ? (
    <CorpusProblemView
      problem={problem}
      workspaceName={workspaceName}
      folder={folder}
      onRetry={retry}
    />
  ) : undefined;
  const runtimeWorkspace = list?.workspaces.find((item) => item.isRuntimeWorkspace);
  const shownDocumentId =
    documentId ?? (supportsSplit ? tree.data?.rootIndexDocumentId : undefined);

  const picker: ReactNode =
    list && workspaceId ? (
      <WorkspacePicker
        workspaces={list}
        selectedWorkspaceId={workspaceId}
        onSelect={pick}
        sessionWorkspaceId={sessionId ? runtimeWorkspace?.workspaceId : undefined}
      />
    ) : undefined;

  return (
    <ArticleChromeContext.Provider value={chrome}>
      <ArticleNavigationContext.Provider value={articleNavigation}>
        <ArticleStackControlContext.Provider value={stackControl}>
          <AppWorkspace
            scroll="content"
            fit="available"
            // Back already leaves the stacked article; a Close would repeat it.
            stackedSecondaryClose="hide"
            primaryMaxPx={360}
            split="secondary"
            labels={{
              ...workspaceLabels,
              backToPrimary: t('docs.backToDocumentation'),
              closeSecondary: t('docs.closeDocument'),
            }}
          >
            <AppWorkspace.Primary header={<WorkspaceHeader title={t('docs.title')} />}>
              <DocsTreePane
                workspaceId={workspaceId}
                sessionBack={
                  sessionId ? (
                    <ApplicationSessionBack
                      sessionId={sessionId}
                      sessionTitle={session.sessionTitle}
                      collection="current"
                    />
                  ) : undefined
                }
                picker={picker}
                notices={notices}
                tree={problem ? undefined : tree.data}
                treeLoading={workspaceId === undefined || tree.isPending}
                // Split layouts say the problem where the article would be.
                problem={!supportsSplit ? problemView : problem ? null : undefined}
                activeDocumentId={shownDocumentId}
                onOpen={openFromList}
              />
            </AppWorkspace.Primary>
            {measured && supportsSplit
              ? readerArticleArea({
                  workspaceId,
                  workspaceName,
                  documentId: shownDocumentId,
                  requested: documentId !== undefined,
                  sectionId,
                  tree: tree.data,
                  treeLoading: tree.isPending,
                  problem: problemView,
                  historyEntry,
                  notify,
                  labels: {
                    fallbackTitle: t('docs.article.fallbackTitle'),
                    loading: t('docs.article.loading'),
                  },
                })
              : null}
          </AppWorkspace>
        </ArticleStackControlContext.Provider>
      </ArticleNavigationContext.Provider>
    </ArticleChromeContext.Provider>
  );
}
