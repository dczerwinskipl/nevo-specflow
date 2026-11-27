import { RefreshStatus } from '../../../app/loading/RefreshStatus';
import { ApplicationLocationIdentity } from '../../../app/navigation/ApplicationLocation';
import { WorkspaceRouteLeaveGuard } from '../../../app/navigation/WorkspaceRouteLeaveGuard';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { WorkView } from './WorkView';
import { OverviewVisitScroll } from './OverviewVisitScroll';
import { SpecificationActivityHistory } from './activity/SpecificationActivityHistory';
import { isSpecificationCreatedEvent } from './activity/presentActivity';
import {
  WorkspaceProvider,
  type TaskSection,
  type TasksPageTarget,
  type WorkspaceRuntime,
} from './WorkspaceContext';
import {
  SpecificationSecondaryDataContext,
  documentPreviewStack,
  historyStack,
  type SpecificationSecondaryContextValue,
} from './specificationSecondaryStack';
import { useActivityHistoryPanel } from './useActivityHistoryPanel';
import { EnsureSpecificationState } from '../SpecificationStateProvider';
import {
  SpecificationWorkflowProvider,
  useSpecificationExitActions,
  feedbackStack,
  type FeedbackRef,
} from '../../tasks';
import { productIcons } from '../../../shared/product-icons';

function fullTaskHref(specId: string, taskId: string, collection: 'current' | 'archive'): string {
  const search = collection === 'archive' ? '?collection=archive' : '';

  return `/specs/${encodeURIComponent(specId)}/tasks/${encodeURIComponent(taskId)}${search}`;
}

function tasksHref(
  specId: string,
  collection: 'current' | 'archive',
  target: TasksPageTarget = {},
): string {
  const search = new URLSearchParams({
    collection,
    ...(target.blocking ? { blocking: target.blocking } : {}),
    ...(target.group ? { group: target.group } : {}),
  });

  return `/specs/${encodeURIComponent(specId)}/tasks?${search}`;
}

export interface SpecificationWorkspaceProps {
  readonly specId: string;
  readonly collection?: 'current' | 'archive';
  readonly data: SpecificationWorkspaceData;
  readonly onOpenDocuments?: () => void;
  readonly onOpenSessions?: () => void;
  readonly onOpenRepository?: () => void;
  readonly onOpenChanges?: (source?: 'base' | 'uncommitted' | 'mr') => void;
  readonly onOpenTask?: (taskId: string, section?: TaskSection) => void;
  readonly onOpenTasks?: (target?: TasksPageTarget) => void;
  readonly onOpenFullDocument?: (documentId: string) => void;
  readonly onRefresh?: () => void | Promise<void>;
  readonly onOpenSession?: (sessionId: string) => void;
  /** Opens the Specification's New Session (`/specs/$specId/sessions/new`). */
  readonly onNewSession?: () => void;
  readonly refreshFailed?: boolean;
  readonly refreshing?: boolean;
}

export function SpecificationWorkspace(props: SpecificationWorkspaceProps) {
  return (
    <EnsureSpecificationState>
      <AppWorkspaceProvider scopeKey={props.specId}>
        <WorkspaceRouteLeaveGuard />
        <SpecificationWorkflowProvider key={props.specId} specId={props.specId}>
          <SpecificationWorkspaceInner {...props} />
        </SpecificationWorkflowProvider>
      </AppWorkspaceProvider>
    </EnsureSpecificationState>
  );
}

function SpecificationWorkspaceInner({
  specId,
  data,
  collection = 'current',
  onOpenDocuments,
  onOpenSessions,
  onOpenRepository,
  onOpenChanges,
  onOpenTask,
  onOpenTasks,
  onOpenFullDocument,
  onRefresh,
  onOpenSession,
  onNewSession,
  refreshFailed,
  refreshing = false,
}: SpecificationWorkspaceProps) {
  const { t } = useTranslation();
  const workspaceLabels = useWorkspaceLabels(t('specification.viewOverview'));
  const secondaryNavigation = useSecondaryNavigation();
  const { supportsSplit } = useWorkspaceCapabilities();
  // Close and Abandon (project Runtime): overflow actions after the Overview's own.
  const exitActions = useSpecificationExitActions();
  // The created event alone is no reason to open the history: only a Session (later Task or
  // document) event is.
  const historyPanel = useActivityHistoryPanel(
    specId,
    data.activityEvents.some((event) => !isSpecificationCreatedEvent(event)),
  );

  // The flow the Overview last opened is a document preview: it takes half of the workspace (the
  // Overview reads in one column beside it); every other Secondary keeps the Overview's share.
  // Recorded only once the open succeeded (a leave guard can refuse it), and only by the latest
  // open: an earlier one that settles late never decides the split.
  const [documentOpened, setDocumentOpened] = useState(false);
  const latestOpen = useRef(0);
  const split = documentOpened && secondaryNavigation.isOpen ? 'balanced' : 'primary';
  const recordOpen = useCallback((opening: Promise<boolean>, document: boolean) => {
    const request = ++latestOpen.current;
    void opening.then((opened) => {
      if (opened && request === latestOpen.current) {
        setDocumentOpened(document);
      }
    });
  }, []);

  const handleOpenHistory = useCallback(() => {
    recordOpen(secondaryNavigation.open(historyStack, { specId }), false);
  }, [secondaryNavigation, specId, recordOpen]);

  const handleOpenFeedback = useCallback(
    (ref: FeedbackRef) => {
      // The one Feedback view: Back (or Close) returns to where the reader came from.
      recordOpen(secondaryNavigation.open(feedbackStack, { specId, ref }), false);
    },
    [secondaryNavigation, specId, recordOpen],
  );

  const handleOpenFullTask = useCallback(
    (taskId: string, section?: TaskSection) => {
      void secondaryNavigation.close();
      if (onOpenTask) {
        onOpenTask(taskId, section);

        return;
      }

      // Standalone presentation surfaces also promote Full Task to its canonical route.
      window.location.assign(fullTaskHref(specId, taskId, collection));
    },
    [secondaryNavigation, onOpenTask, collection, specId],
  );

  const handleOpenDoc = useCallback(
    (docId: string, _origin: 'work' | 'documents' = 'work') => {
      recordOpen(
        secondaryNavigation.open(documentPreviewStack, { specId, documentId: docId }),
        true,
      );
    },
    [secondaryNavigation, specId, recordOpen],
  );

  const secondaryContextValue: SpecificationSecondaryContextValue = useMemo(
    () => ({
      specId,
      data,
      openFullTask: handleOpenFullTask,
      openFullDocument: (documentId: string) => {
        void secondaryNavigation.close();
        if (onOpenFullDocument) {
          onOpenFullDocument(documentId);
        }
      },
      openSession: onOpenSession,
      openDoc: (docId) => handleOpenDoc(docId, 'work'),
      retry: onRefresh ? () => void onRefresh() : undefined,
    }),
    [
      onRefresh,
      specId,
      data,
      handleOpenFullTask,
      onOpenFullDocument,
      secondaryNavigation,
      onOpenSession,
      handleOpenDoc,
    ],
  );

  const runtime: WorkspaceRuntime = useMemo(
    () => ({
      openTask: handleOpenFullTask,
      openTasks: (target) => {
        void secondaryNavigation.close();
        onOpenTasks?.(target);
      },
      openSession: (id) => onOpenSession?.(id),
      openSessionsView: () => onOpenSessions?.(),
      openDoc: (docId, origin = 'work') => handleOpenDoc(docId, origin),
      openDocumentsView: () => onOpenDocuments?.(),
      openRepository: () => onOpenRepository?.(),
      openChanges: (source) => onOpenChanges?.(source),
      openHistory: handleOpenHistory,
      openFeedback: handleOpenFeedback,
      openNewSession: () => onNewSession?.(),
      refresh: () => {
        if (!refreshing) {
          return onRefresh?.();
        }
      },
      canOpenSession: Boolean(onOpenSession),
      fullTaskHref: (taskId) => fullTaskHref(specId, taskId, collection),
      tasksHref: (target) => tasksHref(specId, collection, target),
    }),
    [
      handleOpenFullTask,
      onOpenSession,
      onOpenDocuments,
      onOpenSessions,
      onOpenRepository,
      onOpenChanges,
      handleOpenDoc,
      handleOpenHistory,
      handleOpenFeedback,
      onOpenTasks,
      secondaryNavigation,
      onRefresh,
      refreshing,
      onNewSession,
      collection,
      specId,
    ],
  );

  return (
    <SpecificationSecondaryDataContext.Provider value={secondaryContextValue}>
      <WorkspaceProvider runtime={runtime}>
        <AppWorkspace split={split} fit="available" labels={workspaceLabels}>
          <AppWorkspace.Primary
            header={
              <WorkspaceHeader
                title={t('specification.viewOverview')}
                as="span"
                identityContent={
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ApplicationLocationIdentity
                        title={t('specification.viewOverview')}
                        view="overview"
                        specId={specId}
                      />
                    </div>
                    <RefreshStatus active={refreshing} label={t('specifications.refreshing')} />
                  </div>
                }
                icon={productIcons.overview}
                labels={{ moreActions: t('common.moreActions') }}
                actions={[
                  // Narrow: history opens as a contextual flow. Split: the declarative history
                  // Secondary is shown or hidden by a toggle, the way back when it starts closed.
                  supportsSplit
                    ? {
                        id: 'history',
                        icon: productIcons.history,
                        presentation: 'icon' as const,
                        label: t('specification.activityHistory'),
                        pressed: historyPanel.visible,
                        direct: 'always' as const,
                        onPress: () => void historyPanel.toggle(),
                      }
                    : {
                        id: 'history',
                        icon: productIcons.history,
                        label: t('specification.activityHistory'),
                        onPress: handleOpenHistory,
                      },
                  ...(onRefresh
                    ? [
                        {
                          id: 'refresh',
                          icon: 'refresh' as const,
                          label: t(
                            refreshing ? 'specifications.refreshing' : 'specifications.refresh',
                          ),
                          disabled: refreshing,
                          onPress: () => {
                            if (!refreshing) {
                              void onRefresh();
                            }
                          },
                        },
                      ]
                    : []),
                  ...exitActions,
                ]}
              />
            }
          >
            {/* The scroller fills the pane. Overview is a left-aligned reading column inside it,
              or two columns filling it once the pane is wide enough (WorkView). */}
            <AppContent className="w-full">
              <AppWorkspaceBody scroll="area" contentClassName="py-6">
                <AppContentContainer align="start" size="full" className="grid gap-6">
                  {refreshFailed ? (
                    <Alert
                      tone="attention"
                      role="status"
                      title={t('specification.staleDataTitle')}
                      className="max-w-content-standard"
                    >
                      {t('specification.staleDataDescription')}
                    </Alert>
                  ) : null}

                  {/* Specification Overview contributions. Primary destinations belong to Router. */}
                  <OverviewVisitScroll />
                  <WorkView specId={specId} data={data} />
                </AppContentContainer>
              </AppWorkspaceBody>
            </AppContent>
          </AppWorkspace.Primary>

          {/* Declarative base Secondary: Activity history on split-capable layouts, open by
            default only when it has entries (useActivityHistoryPanel). */}
          <AppWorkspace.Secondary
            open={historyPanel.open}
            onOpenChange={historyPanel.setOpen}
            header={<WorkspaceHeader as="h2" title={t('specification.activityHistory')} />}
          >
            <AppContent>
              <AppWorkspaceBody padding="none" scroll="area">
                {/* The same Activity history as the stacked screen: one timeline. */}
                <SpecificationActivityHistory
                  specId={specId}
                  events={data.activityEvents}
                  availability={data.sectionAvailability?.activity ?? 'available'}
                  unavailableReason={data.sectionUnavailableReason?.activity}
                  onRetry={onRefresh ? () => void onRefresh() : undefined}
                  onOpenTask={(taskId) => handleOpenFullTask(taskId)}
                  onOpenSession={onOpenSession}
                  onOpenDoc={(docId) => handleOpenDoc(docId, 'work')}
                  onOpenFeedback={handleOpenFeedback}
                />
              </AppWorkspaceBody>
            </AppContent>
          </AppWorkspace.Secondary>
        </AppWorkspace>
      </WorkspaceProvider>
    </SpecificationSecondaryDataContext.Provider>
  );
}
