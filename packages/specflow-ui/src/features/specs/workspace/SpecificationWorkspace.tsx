import { useMemo, useState } from 'react';
import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Icon,
  Link,
  SegmentedControl,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type {
  SpecificationScenario,
  SpecificationWorkspaceData,
  SpecificationWorkspaceView,
} from './model';
import { createSpecificationWorkspaceFixture } from './fixtures';
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

export interface SpecificationWorkspaceProps {
  readonly specId: string;
  readonly overviewHref?: string;
  readonly onBack?: () => void;
  readonly scenario?: SpecificationScenario;
  readonly initialView?: SpecificationWorkspaceView;
  readonly initialTask?: string;
  readonly data?: SpecificationWorkspaceData;
}

export function SpecificationWorkspace({
  specId,
  overviewHref,
  onBack,
  scenario = 'working',
  initialView = 'work',
  initialTask,
  data: dataProp,
}: SpecificationWorkspaceProps) {
  const { t } = useTranslation();

  const data = useMemo(
    () => dataProp ?? createSpecificationWorkspaceFixture(scenario, specId),
    [dataProp, scenario, specId],
  );

  const [currentView, setCurrentView] = useState<SpecificationWorkspaceView>(
    initialTask ? 'task' : initialView,
  );
  const [fullTaskId, setFullTaskId] = useState<string | null>(initialTask ?? null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [explicitHistory, setExplicitHistory] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<ReadonlySet<string>>(new Set());
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docOrigin, setDocOrigin] = useState<'work' | 'documents'>('documents');
  const [changesSource, setChangesSource] = useState<'base' | 'uncommitted' | 'mr'>('base');
  const [activeModal, setActiveModal] = useState<'execute' | 'conversation' | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const availableViews: [SpecificationWorkspaceView, string][] = useMemo(() => {
    const list: [SpecificationWorkspaceView, string][] = [
      ['work', t('specification.viewWork')],
      ['documents', t('specification.viewDocuments')],
      ['sessions', t('specification.viewSessions')],
    ];
    if (data.hasGit) {
      list.push(['changes', t('specification.viewChanges')]);
      list.push(['repository', t('specification.viewRepository')]);
    }
    return list;
  }, [data.hasGit, t]);

  const handleSelectTask = (taskId: string, selected: boolean) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  };

  const handlePreviewTask = (taskId: string) => {
    setPreviewTaskId(taskId);
    setExplicitHistory(false);
  };

  const handleOpenFullTask = (taskId: string) => {
    setFullTaskId(taskId);
    setCurrentView('task');
    setPreviewTaskId(null);
  };

  const handleBackFromFullTask = () => {
    setFullTaskId(null);
    setCurrentView('work');
  };

  const handleOpenDoc = (docId: string, origin: 'work' | 'documents' = 'work') => {
    setActiveDocId(docId);
    setDocOrigin(origin);
    setCurrentView('documents');
  };

  const handleOpenChanges = (source: 'base' | 'uncommitted' | 'mr') => {
    setChangesSource(source);
    setCurrentView('changes');
  };

  const handleOpenSession = (sessionId: string) => {
    setNotification(t('specification.sessionOpenedNotification', { id: sessionId }));
    setTimeout(() => setNotification(null), 3000);
  };

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
    <>
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
              actions={[
                {
                  id: 'refresh',
                  icon: 'refresh',
                  label: t('specifications.refresh'),
                  onPress: () => {
                    setNotification(t('specification.refreshedNotification'));
                    setTimeout(() => setNotification(null), 3000);
                  },
                },
              ]}
            />
          }
        >
          <AppContent className="w-content-xwide max-w-full">
            <AppWorkspaceBody className="py-6">
              <AppContentContainer align="start" size="full" className="grid gap-6">
                {/* Back to Specifications link (preserves test contract) */}
                <div className="flex flex-wrap items-center justify-between gap-4">
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
                      <span className="inline-flex items-center gap-2 text-body-sm font-medium">
                        <Icon name="arrow-right" size="sm" className="rotate-180" />
                        <span data-spec-back-label>{t('specification.backToSpecifications')}</span>
                      </span>
                    </Link>
                  ) : (
                    <span />
                  )}

                  <span data-spec-identity className="font-mono text-body-xs text-content-muted">
                    {t('specification.identity', { id: specId })}
                  </span>
                </div>

                {/* Local View Selector / Tabs */}
                {currentView !== 'task' ? (
                  <div className="border-b border-border-subtle pb-3">
                    <SegmentedControl
                      value={currentView}
                      onValueChange={(val) => {
                        setCurrentView(val as SpecificationWorkspaceView);
                        setActiveDocId(null);
                      }}
                      aria-label={t('specification.viewsAriaLabel')}
                    >
                      {availableViews.map(([id, label]) => (
                        <SegmentedControl.Item key={id} value={id}>
                          {label}
                          {id === 'documents' && data.documents.length > 0 ? (
                            <span className="ml-1.5 text-body-xs text-content-muted">
                              ({data.documents.length})
                            </span>
                          ) : null}
                        </SegmentedControl.Item>
                      ))}
                    </SegmentedControl>
                  </div>
                ) : null}

                {/* View Content */}
                {currentView === 'work' ? (
                  <WorkView
                    data={data}
                    selectedTasks={selectedTasks}
                    onSelectTask={handleSelectTask}
                    onPreviewTask={handlePreviewTask}
                    onOpenSession={handleOpenSession}
                    onOpenSessionsView={() => setCurrentView('sessions')}
                    onOpenDoc={(docId) => handleOpenDoc(docId, 'work')}
                    onOpenDocumentsView={() => setCurrentView('documents')}
                    onOpenChanges={handleOpenChanges}
                    onOpenRepository={() => setCurrentView('repository')}
                    onOpenHistory={() => setExplicitHistory(true)}
                    onNewConversation={() => setActiveModal('conversation')}
                    onExecuteSelected={() => setActiveModal('execute')}
                    fullTaskHref={(taskId) => `#/specs/${specId}?task=${taskId}`}
                  />
                ) : currentView === 'documents' ? (
                  <DocumentsView
                    documents={data.documents}
                    activeDocId={activeDocId}
                    docOrigin={docOrigin}
                    onSelectDoc={(id) => setActiveDocId(id)}
                    onBackToOrigin={() => {
                      if (docOrigin === 'work') {
                        setCurrentView('work');
                      }
                      setActiveDocId(null);
                    }}
                  />
                ) : currentView === 'sessions' ? (
                  <SessionsView
                    sessions={data.sessions}
                    onOpenSession={handleOpenSession}
                    onNewConversation={() => setActiveModal('conversation')}
                  />
                ) : currentView === 'changes' ? (
                  <ChangesView
                    currentSource={changesSource}
                    onSourceChange={setChangesSource}
                    onDiff={(file) => {
                      setNotification(t('specification.diffNotification', { file }));
                      setTimeout(() => setNotification(null), 3000);
                    }}
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
                    onOpenSession={handleOpenSession}
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
                onOpenSession={handleOpenSession}
                onOpenDoc={(docId) => handleOpenDoc(docId, 'work')}
              />
            )}
          </AppContent>
        </AppWorkspace.Secondary>
      </AppWorkspace>

      {/* Modals */}
      <ExecuteModal
        open={activeModal === 'execute'}
        selectedTasks={Array.from(selectedTasks)}
        onClose={() => setActiveModal(null)}
        onExecute={(agent) => {
          setActiveModal(null);
          setNotification(
            t('specification.executeStartedNotification', {
              agent,
              count: selectedTasks.size,
            }),
          );
          setTimeout(() => setNotification(null), 3000);
        }}
      />

      <NewConversationModal
        open={activeModal === 'conversation'}
        onClose={() => setActiveModal(null)}
        onStart={(agent) => {
          setActiveModal(null);
          setNotification(t('specification.conversationStartedNotification', { agent }));
          setTimeout(() => setNotification(null), 3000);
        }}
      />

      {/* Toast Notification */}
      {notification ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-control border border-border-default bg-surface-raised px-4 py-2.5 text-body-sm text-content-primary shadow-lg"
        >
          {notification}
        </div>
      ) : null}
    </>
  );
}
