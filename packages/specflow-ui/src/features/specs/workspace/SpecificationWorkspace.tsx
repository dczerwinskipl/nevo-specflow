import { useMemo, useState, useEffect } from 'react';
import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Icon,
  Link,
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
  readonly onViewChange?: (view: SpecificationWorkspaceView) => void;
  readonly onRefresh?: () => void | Promise<void>;
  readonly onExecute?: (agent: string, tasks: readonly string[]) => void | Promise<void>;
  readonly onNewConversation?: (agent: string) => void | Promise<void>;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly onDiff?: (file: string) => void;
}

export function SpecificationWorkspace({
  specId,
  data,
  overviewHref,
  onBack,
  initialView = 'work',
  initialTask,
  onViewChange,
  onRefresh,
  onExecute,
  onNewConversation,
  onOpenSession,
  onDiff,
}: SpecificationWorkspaceProps) {
  const { t } = useTranslation();

  const [currentView, setCurrentView] = useState<SpecificationWorkspaceView>(
    initialTask ? 'task' : initialView,
  );
  const [fullTaskId, setFullTaskId] = useState<string | null>(initialTask ?? null);
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
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    if (initialTask) {
      setFullTaskId(initialTask);
      setCurrentView('task');
    }
  }, [initialTask]);

  const handleViewChange = (view: SpecificationWorkspaceView) => {
    setCurrentView(view);
    onViewChange?.(view);
  };

  const handlePreviewTask = (taskId: string) => {
    setPreviewTaskId(taskId);
    setExplicitHistory(false);
  };

  const handleOpenFullTask = (taskId: string) => {
    setFullTaskId(taskId);
    handleViewChange('task');
    setPreviewTaskId(null);
  };

  const handleBackFromFullTask = () => {
    setFullTaskId(null);
    handleViewChange('work');
  };

  const handleOpenDoc = (docId: string, origin: 'work' | 'documents' = 'work') => {
    setActiveDocId(docId);
    setDocOrigin(origin);
    handleViewChange('documents');
  };

  const handleOpenChanges = (source: 'base' | 'uncommitted' | 'mr' = 'base') => {
    setChangesSource(source);
    handleViewChange('changes');
  };

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
      fullTaskHref: (taskId) => `#/specs/${specId}?task=${taskId}`,
    }),
    [specId, onOpenSession, onRefresh],
  );

  const previewTask = useMemo(() => {
    if (!previewTaskId) return null;
    return data.taskGroups.flatMap((g) => g.tasks).find((t) => t.id === previewTaskId) ?? null;
  }, [data.taskGroups, previewTaskId]);

  const fullTask = useMemo(() => {
    if (!fullTaskId) return null;
    return data.taskGroups.flatMap((g) => g.tasks).find((t) => t.id === fullTaskId) ?? null;
  }, [data.taskGroups, fullTaskId]);

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
                    onOpenSession={(id) => onOpenSession?.(id)}
                    onNewConversation={() => setConversationDialogOpen(true)}
                  />
                ) : currentView === 'changes' ? (
                  <ChangesView
                    currentSource={changesSource}
                    changes={data.changes}
                    onSourceChange={setChangesSource}
                    onDiff={(file) => onDiff?.(file)}
                  />
                ) : currentView === 'repository' ? (
                  <RepositoryView
                    repoContext={data.repoContext}
                    onGoToChanges={() => setCurrentView('changes')}
                  />
                ) : currentView === 'task' && fullTask ? (
                  <FullTaskView
                    task={fullTask}
                    specKey={specId}
                    onBack={handleBackFromFullTask}
                    onOpenSession={(id) => onOpenSession?.(id)}
                  />
                ) : null}
              </AppContentContainer>
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>

        {/* Secondary Panel: Defaults to Activity History, replaced by Task Preview when activated */}
        <AppWorkspace.Secondary
          header={
            <WorkspaceHeader
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
                onClose={() => setPreviewTaskId(null)}
                onOpenFull={handleOpenFullTask}
              />
            ) : (
              <ActivityHistory
                events={data.activityEvents}
                isExplicit={explicitHistory}
                onClose={() => setExplicitHistory(false)}
                onOpenTask={handlePreviewTask}
                onOpenSession={(id) => onOpenSession?.(id)}
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
        onExecute={(agent) => {
          setExecuteDialogOpen(false);
          void onExecute?.(agent, Array.from(tasksToExecute));
        }}
      />

      <NewConversationModal
        open={conversationDialogOpen}
        onClose={() => setConversationDialogOpen(false)}
        onStart={(agent) => {
          setConversationDialogOpen(false);
          void onNewConversation?.(agent);
        }}
      />
    </WorkspaceProvider>
  );
}
