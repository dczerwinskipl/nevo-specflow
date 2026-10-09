import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  Button,
  Icon,
  Link,
  Typography,
  useSecondaryNavigation,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type {
  DocumentItem,
  TaskItem,
  SpecificationWorkspaceData,
  SpecificationWorkspaceView,
} from './model';
import { WorkView } from './WorkView';
import { DocumentsView } from './DocumentsView';
import { SessionsView } from './SessionsView';
import { ChangesView } from './ChangesView';
import { RepositoryView } from './RepositoryView';
import { FullTaskView } from './FullTaskView';
import { ActivityHistory } from './ActivityHistory';
import { ExecuteModal } from './ExecuteModal';
import { NewConversationModal } from './NewConversationModal';
import { WorkspaceProvider, type WorkspaceRuntime } from './WorkspaceContext';
import {
  SpecificationSecondaryDataContext,
  taskPreviewStack,
  historyStack,
  type SpecificationSecondaryContextValue,
} from './specificationSecondaryStack';
import { useSpecificationViewNavigation } from './useSpecificationViewNavigation';
import { useSpecificationDialogs } from './useSpecificationDialogs';

export interface SpecificationWorkspaceProps {
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
  readonly overviewHref?: string;
  readonly onBack?: () => void;
  readonly initialView?: SpecificationWorkspaceView;
  readonly initialTask?: string;
  /** @deprecated Use onNavigateView instead */
  readonly onViewChange?: (view: SpecificationWorkspaceView) => void;
  /** @deprecated Use onNavigateView instead */
  readonly onTaskChange?: (taskId: string | null) => void;
  readonly onNavigateView?: (target: {
    view: SpecificationWorkspaceView;
    taskId?: string | null;
  }) => void;
  readonly onRefresh?: () => void | Promise<void>;
  readonly onExecute?: (agent: string, tasks: readonly string[]) => void | Promise<void>;
  readonly onNewConversation?: (agent: string) => void | Promise<void>;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly onDiff?: (file: string) => void;
  readonly renderDocument?: (doc: DocumentItem) => ReactNode;
  readonly renderTask?: (task: TaskItem, onBack: () => void) => ReactNode;
  readonly refreshFailed?: boolean;
}

export function SpecificationWorkspace(props: SpecificationWorkspaceProps) {
  return (
    <AppWorkspaceProvider scopeKey={props.specId}>
      <SpecificationWorkspaceInner {...props} />
    </AppWorkspaceProvider>
  );
}

function SpecificationWorkspaceInner({
  specId,
  data,
  overviewHref,
  onBack,
  initialView = 'work',
  initialTask,
  onViewChange,
  onTaskChange,
  onNavigateView,
  onRefresh,
  onExecute,
  onNewConversation,
  onOpenSession,
  onDiff,
  renderDocument,
  renderTask,
  refreshFailed,
}: SpecificationWorkspaceProps) {
  const { t } = useTranslation();
  const secondaryNavigation = useSecondaryNavigation();

  const { currentView, fullTaskId, navigateToView, handleViewChange } =
    useSpecificationViewNavigation({
      initialView,
      initialTask,
      onNavigateView,
      onViewChange,
      onTaskChange,
    });

  const {
    executeDialogOpen,
    conversationDialogOpen,
    tasksToExecute,
    openExecuteDialog,
    closeExecuteDialog,
    handleConfirmExecute,
    openConversationDialog,
    closeConversationDialog,
    handleConfirmConversation,
  } = useSpecificationDialogs({
    onExecute,
    onNewConversation,
  });

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docOrigin, setDocOrigin] = useState<'work' | 'documents'>('documents');
  const [changesSource, setChangesSource] = useState<'base' | 'uncommitted' | 'mr'>('base');

  const handlePreviewTask = useCallback(
    (taskId: string) => {
      void secondaryNavigation.open(taskPreviewStack, { specId, taskId });
    },
    [secondaryNavigation, specId],
  );

  const handleOpenHistory = useCallback(() => {
    void secondaryNavigation.open(historyStack, { specId });
  }, [secondaryNavigation, specId]);

  const handleOpenFullTask = useCallback(
    (taskId: string) => {
      void secondaryNavigation.close();
      navigateToView('task', taskId);
    },
    [secondaryNavigation, navigateToView],
  );

  const handleBackFromFullTask = useCallback(() => {
    navigateToView('work', null);
  }, [navigateToView]);

  const handleOpenDoc = useCallback(
    (docId: string, origin: 'work' | 'documents' = 'work') => {
      setActiveDocId(docId);
      setDocOrigin(origin);
      navigateToView('documents', null);
    },
    [navigateToView],
  );

  const handleOpenChanges = useCallback(
    (source: 'base' | 'uncommitted' | 'mr' = 'base') => {
      setChangesSource(source);
      navigateToView('changes', null);
    },
    [navigateToView],
  );

  const fullTask = useMemo(() => {
    if (!fullTaskId) return null;
    return data.taskGroups.flatMap((g) => g.tasks).find((t) => t.id === fullTaskId) ?? null;
  }, [data.taskGroups, fullTaskId]);

  const secondaryContextValue: SpecificationSecondaryContextValue = useMemo(
    () => ({
      specId,
      data,
      openFullTask: handleOpenFullTask,
      openSession: onOpenSession,
      openDoc: (docId) => handleOpenDoc(docId, 'work'),
      previewTask: handlePreviewTask,
    }),
    [specId, data, handleOpenFullTask, onOpenSession, handleOpenDoc, handlePreviewTask],
  );

  const runtime: WorkspaceRuntime = useMemo(
    () => ({
      previewTask: handlePreviewTask,
      openTask: handleOpenFullTask,
      openSession: (id) => onOpenSession?.(id),
      openSessionsView: () => handleViewChange('sessions'),
      openDoc: (docId, origin = 'work') => handleOpenDoc(docId, origin),
      openDocumentsView: () => handleViewChange('documents'),
      openRepository: () => handleViewChange('repository'),
      openChanges: handleOpenChanges,
      openHistory: handleOpenHistory,
      startConversation: (_agent) => openConversationDialog(),
      executeTasks: (taskIds, _agent) => openExecuteDialog(taskIds),
      refresh: () => onRefresh?.(),
      canExecute: Boolean(onExecute),
      canStartConversation: Boolean(onNewConversation),
      canOpenSession: Boolean(onOpenSession),
      fullTaskHref: (taskId) => {
        const params = new URLSearchParams();
        if (overviewHref?.includes('collection=archive')) {
          params.set('collection', 'archive');
        }
        params.set('view', 'task');
        params.set('task', taskId);
        return `/specs/${encodeURIComponent(specId)}?${params.toString()}`;
      },
    }),
    [
      handlePreviewTask,
      handleOpenFullTask,
      onOpenSession,
      handleViewChange,
      handleOpenDoc,
      handleOpenChanges,
      handleOpenHistory,
      openConversationDialog,
      openExecuteDialog,
      onRefresh,
      onExecute,
      onNewConversation,
      overviewHref,
      specId,
    ],
  );

  const headerTitle =
    currentView === 'task' && fullTask ? `Task / ${fullTask.id}` : t('specification.title');

  return (
    <SpecificationSecondaryDataContext.Provider value={secondaryContextValue}>
      <WorkspaceProvider runtime={runtime}>
        <AppWorkspace
          split="primary"
          labels={{
            backToPrimary: t('navigation.back'),
            closeSecondary: t('navigation.closeSecondary'),
            openNavigation: t('navigation.open'),
          }}
        >
          <AppWorkspace.Primary
            header={
              <WorkspaceHeader
                title={headerTitle}
                actions={
                  onRefresh
                    ? [
                        {
                          id: 'refresh',
                          icon: 'refresh',
                          label: t('specifications.refresh'),
                          onPress: () => {
                            void onRefresh();
                          },
                        },
                      ]
                    : []
                }
              />
            }
          >
            <AppContent className="w-content-xwide max-w-full">
              <AppWorkspaceBody className="py-6">
                <AppContentContainer align="start" size="full" className="grid gap-6">
                  {/* Eyebrow: Spec / ${specId} with back link */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 text-body-sm text-content-muted">
                      {overviewHref ? (
                        <Link
                          href={overviewHref}
                          className="w-fit"
                          onClick={(event) => {
                            if (
                              onBack &&
                              event.button === 0 &&
                              !event.metaKey &&
                              !event.ctrlKey &&
                              !event.shiftKey &&
                              !event.altKey
                            ) {
                              event.preventDefault();
                              onBack();
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1.5 font-medium text-content-secondary hover:text-content-primary">
                            <Icon name="arrow-right" size="sm" className="rotate-180" />
                            <span data-spec-back-label>
                              {t('specification.backToSpecifications')}
                            </span>
                          </span>
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-content-secondary">
                          <span data-spec-back-label>
                            {t('specification.backToSpecifications')}
                          </span>
                        </span>
                      )}

                      <span aria-hidden="true" className="text-content-muted">
                        /
                      </span>
                      <span
                        data-spec-identity
                        className="font-mono text-body-xs text-content-muted"
                      >
                        {t('specification.identity', { id: specId })}
                      </span>
                    </div>
                  </div>

                  {refreshFailed ? (
                    <Alert
                      tone="attention"
                      role="status"
                      title={t('specification.unavailableTitle')}
                    >
                      {t('specification.unavailableDescription', { id: specId })}
                    </Alert>
                  ) : null}

                  {/* View Content */}
                  {currentView === 'work' ? (
                    <WorkView specId={specId} data={data} />
                  ) : currentView !== 'task' &&
                    data.sectionAvailability?.[
                      currentView === 'documents' ? 'documents' : currentView
                    ] !== undefined &&
                    data.sectionAvailability?.[
                      currentView === 'documents' ? 'documents' : currentView
                    ] !== 'available' ? (
                    <Alert
                      tone="attention"
                      role="status"
                      title={t('specification.unavailableTitle')}
                    >
                      {t('specification.unavailableDescription', { id: specId })}
                    </Alert>
                  ) : currentView === 'documents' ? (
                    <DocumentsView
                      documents={data.documents}
                      renderContent={renderDocument}
                      activeDocId={activeDocId}
                      docOrigin={docOrigin}
                      onSelectDoc={(id) => setActiveDocId(id)}
                      onBackToOrigin={() => {
                        if (docOrigin === 'work') {
                          handleViewChange('work');
                        }
                        setActiveDocId(null);
                      }}
                    />
                  ) : currentView === 'sessions' ? (
                    <SessionsView
                      sessions={data.sessions}
                      onOpenSession={onOpenSession}
                      onNewConversation={
                        onNewConversation ? () => openConversationDialog() : undefined
                      }
                    />
                  ) : currentView === 'changes' ? (
                    <ChangesView
                      currentSource={changesSource}
                      changes={data.changes}
                      onSourceChange={setChangesSource}
                      onDiff={onDiff}
                    />
                  ) : currentView === 'repository' ? (
                    <RepositoryView
                      repoContext={data.repoContext}
                      onGoToChanges={() => navigateToView('changes', null)}
                    />
                  ) : currentView === 'task' ? (
                    fullTask ? (
                      renderTask ? (
                        renderTask(fullTask, handleBackFromFullTask)
                      ) : (
                        <FullTaskView
                          task={fullTask}
                          specKey={specId}
                          onBack={handleBackFromFullTask}
                          onOpenSession={onOpenSession}
                        />
                      )
                    ) : (
                      <Alert
                        role="alert"
                        tone="attention"
                        title={t('specification.taskNotFoundTitle')}
                        className="max-w-content-standard"
                      >
                        <Typography variant="body-sm" className="text-content-secondary">
                          {t('specification.taskNotFoundDescription', {
                            taskId: fullTaskId ?? '',
                          })}
                        </Typography>
                        <div className="mt-3 flex items-center gap-3">
                          <Button variant="secondary" size="sm" onClick={handleBackFromFullTask}>
                            {t('specification.backToTasks')}
                          </Button>
                        </div>
                      </Alert>
                    )
                  ) : null}
                </AppContentContainer>
              </AppWorkspaceBody>
            </AppContent>
          </AppWorkspace.Primary>

          {/* Declarative base Secondary: Activity History shown on split-capable layouts */}
          <AppWorkspace.Secondary
            header={<WorkspaceHeader as="h2" title={t('specification.activityHistory')} />}
          >
            <AppContent>
              <ActivityHistory
                events={data.activityEvents}
                onOpenTask={handlePreviewTask}
                onOpenSession={onOpenSession}
                onOpenDoc={(docId) => handleOpenDoc(docId, 'work')}
              />
            </AppContent>
          </AppWorkspace.Secondary>
        </AppWorkspace>

        {/* Explicit Dialogs */}
        <ExecuteModal
          open={executeDialogOpen}
          selectedTasks={Array.from(tasksToExecute)}
          executionReadiness={data.executionReadiness}
          onClose={closeExecuteDialog}
          onExecute={onExecute ? handleConfirmExecute : undefined}
        />

        <NewConversationModal
          open={conversationDialogOpen}
          onClose={closeConversationDialog}
          onStart={onNewConversation ? handleConfirmConversation : undefined}
        />
      </WorkspaceProvider>
    </SpecificationSecondaryDataContext.Provider>
  );
}
