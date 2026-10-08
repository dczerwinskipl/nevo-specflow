import { useMemo, useState, useEffect, useRef } from 'react';
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
  useWorkspace,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecificationWorkspaceData, SpecificationWorkspaceView } from './model';
import { WorkView } from './WorkView';
import { DocumentsView } from './DocumentsView';
import { SessionsView } from './SessionsView';
import { ChangesView } from './ChangesView';
import { RepositoryView } from './RepositoryView';
import { FullTaskView } from './FullTaskView';
import { ActivityHistory } from './ActivityHistory';
import { TaskPreview } from './TaskPreview';
import { ExecuteModal } from './ExecuteModal';
import { NewConversationModal } from './NewConversationModal';
import { WorkspaceProvider, type WorkspaceRuntime } from './WorkspaceContext';

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
}

export function SpecificationWorkspace(props: SpecificationWorkspaceProps) {
  return (
    <AppWorkspaceProvider>
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
}: SpecificationWorkspaceProps) {
  const { t } = useTranslation();
  const workspace = useWorkspace();

  const [currentView, setCurrentView] = useState<SpecificationWorkspaceView>(
    initialView === 'task' || initialTask ? 'task' : initialView,
  );
  const [fullTaskId, setFullTaskId] = useState<string | null>(
    initialView === 'task' || initialTask ? (initialTask ?? null) : null,
  );
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [explicitHistory, setExplicitHistory] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docOrigin, setDocOrigin] = useState<'work' | 'documents'>('documents');
  const [changesSource, setChangesSource] = useState<'base' | 'uncommitted' | 'mr'>('base');

  // Explicit boolean dialog flags instead of union string modal state
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [tasksToExecute, setTasksToExecute] = useState<readonly string[]>([]);

  useEffect(() => {
    if (initialView === 'task' || initialTask) {
      setCurrentView('task');
      setFullTaskId(initialTask ?? null);
    } else {
      setCurrentView(initialView);
      setFullTaskId(null);
    }
  }, [initialView, initialTask]);

  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const prevSpecIdRef = useRef(specId);
  useEffect(() => {
    if (prevSpecIdRef.current !== specId) {
      prevSpecIdRef.current = specId;
      setPreviewTaskId(null);
      setExplicitHistory(false);
      void workspaceRef.current.closeSecondary();
    }
  }, [specId]);

  const navigateToView = (
    nextView: SpecificationWorkspaceView,
    nextTaskId: string | null = null,
  ) => {
    setCurrentView(nextView);
    setFullTaskId(nextTaskId);
    if (onNavigateView) {
      onNavigateView({ view: nextView, taskId: nextTaskId });
    } else {
      onViewChange?.(nextView);
      onTaskChange?.(nextTaskId);
    }
  };

  const handleViewChange = (view: SpecificationWorkspaceView) => {
    navigateToView(view, null);
  };

  const handlePreviewTask = (taskId: string) => {
    setPreviewTaskId(taskId);
    setExplicitHistory(false);
  };

  const handleOpenFullTask = (taskId: string) => {
    navigateToView('task', taskId);
    setPreviewTaskId(null);
    void workspace.closeSecondary();
  };

  const handleBackFromFullTask = () => {
    navigateToView('work', null);
  };

  const handleOpenDoc = (docId: string, origin: 'work' | 'documents' = 'work') => {
    setActiveDocId(docId);
    setDocOrigin(origin);
    navigateToView('documents', null);
  };

  const handleOpenChanges = (source: 'base' | 'uncommitted' | 'mr' = 'base') => {
    setChangesSource(source);
    navigateToView('changes', null);
  };

  const fullTask = useMemo(() => {
    if (!fullTaskId) return null;
    return data.taskGroups.flatMap((g) => g.tasks).find((t) => t.id === fullTaskId) ?? null;
  }, [data.taskGroups, fullTaskId]);

  const previewTask = useMemo(() => {
    if (!previewTaskId) return null;
    return data.taskGroups.flatMap((g) => g.tasks).find((t) => t.id === previewTaskId) ?? null;
  }, [data.taskGroups, previewTaskId]);

  // Synchronize runtime secondary with previewTask and explicitHistory
  useEffect(() => {
    if (previewTask) {
      void workspaceRef.current.setSecondary(
        {
          header: <WorkspaceHeader as="h2" title={t('specification.taskPreviewTitle')} />,
          content: (
            <AppContent>
              <TaskPreview
                task={previewTask}
                groups={data.taskGroups}
                specKey={specId}
                onClose={() => {
                  setPreviewTaskId(null);
                  void workspaceRef.current.closeSecondary();
                }}
                onOpenFull={(taskId) => {
                  setPreviewTaskId(null);
                  void workspaceRef.current.closeSecondary();
                  handleOpenFullTask(taskId);
                }}
              />
            </AppContent>
          ),
        },
        {
          onClose: () => {
            setPreviewTaskId(null);
          },
        },
      );
    } else if (explicitHistory) {
      void workspaceRef.current.setSecondary(
        {
          header: <WorkspaceHeader as="h2" title={t('specification.activityHistory')} />,
          content: (
            <AppContent>
              <ActivityHistory
                events={data.activityEvents}
                isExplicit={true}
                onClose={() => {
                  setExplicitHistory(false);
                  void workspaceRef.current.closeSecondary();
                }}
                onOpenTask={handlePreviewTask}
                onOpenSession={onOpenSession}
                onOpenDoc={(docId) => handleOpenDoc(docId, 'work')}
              />
            </AppContent>
          ),
        },
        {
          onClose: () => {
            setExplicitHistory(false);
          },
        },
      );
    }
  }, [
    previewTask,
    explicitHistory,
    specId,
    t,
    data.taskGroups,
    data.activityEvents,
    onOpenSession,
  ]);

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
      openHistory: () => setExplicitHistory(true),
      startConversation: (_agent) => setConversationDialogOpen(true),
      executeTasks: (taskIds, _agent) => {
        setTasksToExecute(taskIds);
        setExecuteDialogOpen(true);
      },
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
    [specId, overviewHref, onOpenSession, onRefresh, onExecute, onNewConversation],
  );

  const headerTitle =
    currentView === 'task' && fullTask ? `Task / ${fullTask.id}` : t('specification.title');

  return (
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
                        <span data-spec-back-label>{t('specification.backToSpecifications')}</span>
                      </span>
                    )}

                    <span aria-hidden="true" className="text-content-muted">
                      /
                    </span>
                    <span data-spec-identity className="font-mono text-body-xs text-content-muted">
                      {t('specification.identity', { id: specId })}
                    </span>
                  </div>
                </div>

                {/* View Content */}
                {currentView === 'work' ? (
                  <WorkView data={data} />
                ) : currentView === 'documents' ? (
                  <DocumentsView
                    documents={data.documents}
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
                      onNewConversation ? () => setConversationDialogOpen(true) : undefined
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
                    <FullTaskView
                      task={fullTask}
                      specKey={specId}
                      onBack={handleBackFromFullTask}
                      onOpenSession={onOpenSession}
                    />
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

        {/* Secondary Panel: Defaults to Activity History, replaced by Task Preview when activated */}
        <AppWorkspace.Secondary
          header={
            <WorkspaceHeader
              as="h2"
              title={
                previewTask
                  ? t('specification.taskPreviewTitle')
                  : t('specification.activityHistory')
              }
            />
          }
        >
          <AppContent>
            {previewTask ? (
              <TaskPreview
                task={previewTask}
                groups={data.taskGroups}
                specKey={specId}
                onClose={() => {
                  setPreviewTaskId(null);
                  void workspace.closeSecondary();
                }}
                onOpenFull={(taskId) => {
                  setPreviewTaskId(null);
                  void workspace.closeSecondary();
                  handleOpenFullTask(taskId);
                }}
              />
            ) : (
              <ActivityHistory
                events={data.activityEvents}
                isExplicit={explicitHistory}
                onClose={() => {
                  setExplicitHistory(false);
                  void workspace.closeSecondary();
                }}
                onOpenTask={handlePreviewTask}
                onOpenSession={onOpenSession}
                onOpenDoc={(docId) => handleOpenDoc(docId, 'work')}
              />
            )}
          </AppContent>
        </AppWorkspace.Secondary>
      </AppWorkspace>

      {/* Explicit Dialogs */}
      <ExecuteModal
        open={executeDialogOpen}
        selectedTasks={Array.from(tasksToExecute)}
        executionReadiness={data.executionReadiness}
        onClose={() => setExecuteDialogOpen(false)}
        onExecute={
          onExecute
            ? (agent) => {
                setExecuteDialogOpen(false);
                void onExecute(agent, Array.from(tasksToExecute));
              }
            : undefined
        }
      />

      <NewConversationModal
        open={conversationDialogOpen}
        onClose={() => setConversationDialogOpen(false)}
        onStart={
          onNewConversation
            ? (agent) => {
                setConversationDialogOpen(false);
                void onNewConversation(agent);
              }
            : undefined
        }
      />
    </WorkspaceProvider>
  );
}
