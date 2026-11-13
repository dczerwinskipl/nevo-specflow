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
import { ArticleStackMemoryContext } from '../article/articleStack';
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
  sectionFromHash,
  sessionOf,
  type DocsReaderLocationState,
} from './readerLocation';
import { useNarrowArticleStack } from './useNarrowArticleStack';

/**
 * The documentation reader of one workspace: the tree pane as Primary (capped at 360 px) and the
 * read-only article as Secondary on split layouts; on Narrow the tree is the first screen and the
 * article is pushed over it. Every opened document is a route push.
 */
export function DocsReader({
  current,
  workspaceId,
  documentId,
  hash,
  entry,
  tree,
}: {
  current: CurrentDocsWorkspace;
  /** The settled workspace the address names; `undefined` while it is being resolved. */
  workspaceId: string | undefined;
  documentId: string | undefined;
  hash: string | undefined;
  entry: DocsReaderLocationState | undefined;
  tree: UseQueryResult<WorkspaceDocsTree>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const notify = useNotify();
  const workspaceLabels = useWorkspaceLabels();
  const { supportsSplit, measured } = useWorkspaceCapabilities();
  const [chrome] = useState(createArticleChromeStore);
  const [stackMemory] = useState(() => new Map<string, number>());
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
  const fromReader = entry?.fromReader === true;

  // Stable while the workspace and the way back are: it is a dependency of the article's links.
  const openDocument = useCallback(
    (target: string, section?: string) => {
      if (!workspaceId) {
        return;
      }

      void navigate({
        to: '/workspaces/$workspaceId/docs/$documentId',
        params: { workspaceId, documentId: target },
        hash: hashOfSection(section),
        state: { docsReader: { ...session, fromReader: true } },
      });
    },
    [navigate, workspaceId, session],
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

    // Opened from the reader: the entry before it is the tree's (or the previous article's, after a
    // resize from Wide), so Back steps there instead of adding a second tree entry. An address
    // opened directly is replaced by the tree's.
    if (fromReader) {
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

  const stackRoot = useMemo(() => {
    if (!workspaceId || !documentId || !tree.data) {
      return undefined;
    }

    return {
      workspaceId,
      workspaceName,
      documentId,
      sectionId,
      title:
        tree.data.documents.find((doc) => doc.documentId === documentId)?.title ??
        t('docs.article.fallbackTitle'),
      fromReader,
    };
  }, [workspaceId, workspaceName, documentId, sectionId, tree.data, fromReader, t]);
  useNarrowArticleStack({
    root: problem ? undefined : stackRoot,
    onOpen: () => stackMemory.clear(),
    onClosedByUser: leaveDocument,
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
      <ArticleStackMemoryContext.Provider value={stackMemory}>
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
              onOpen={openDocument}
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
                fromReader: fromReader || documentId === undefined,
                notify,
                openDocument,
                labels: {
                  fallbackTitle: t('docs.article.fallbackTitle'),
                  loading: t('docs.article.loading'),
                },
              })
            : null}
        </AppWorkspace>
      </ArticleStackMemoryContext.Provider>
    </ArticleChromeContext.Provider>
  );
}
