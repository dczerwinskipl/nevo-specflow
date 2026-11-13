import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  WorkspaceHeader,
  useSecondaryNavigation,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import {
  ApplicationContextLine,
  ApplicationLocationIdentity,
} from '../../../app/navigation/ApplicationLocation';
import { TaskDocumentEditorHost, taskDocumentStack } from '../../documents';
import { useSpecificationWorkspace } from '../../specs/read-model';
import type { FullTaskData } from '../read-model/model';
import { useQueryClient } from '@tanstack/react-query';
import { taskAuthoringKeys } from '../authoring/queries';
import { contextView as viewOf } from '../authoring/context/contextModel';
import { entryName, type ContextNames } from '../authoring/context/contextPresentation';
import { EditTaskDetailsDialog, type TaskDetailsVersion } from '../authoring/EditTaskDetailsDialog';
import { useTaskLifecycle } from '../authoring/lifecycle/useTaskLifecycle';
import { TaskAuthoringView } from '../authoring/TaskAuthoringView';
import { useTaskActions, useTaskDocumentTree } from '../authoring/useTaskAuthoring';
import { FullTaskView } from './FullTaskView';

export interface ProjectTaskWorkspaceProps {
  readonly specId: string;
  readonly task: FullTaskData;
  readonly resource: TaskResourceFacts;
  readonly onBack: () => void;
  readonly backHref: string;
  readonly stale?: boolean;
  readonly onRetry?: () => void;
  /** Reads the Task again (revision conflicts); resolves with the latest Task. */
  readonly reload: () => Promise<FullTaskData | undefined>;
  /** Narrow: opens the Task history as a pushed page (the header's history toggle). */
  readonly onOpenHistory: () => void;
}

function versionOf(task: FullTaskData | undefined): TaskDetailsVersion | undefined {
  return task?.resource
    ? { revision: task.resource.revision, title: task.title, summary: task.snapshot?.summary ?? '' }
    : undefined;
}

/**
 * The Full Task of a project Runtime: Task authoring in the Primary, the Task history as the
 * Secondary base and Task documents as Secondary tabs (pushed pages on Narrow).
 */
export function ProjectTaskWorkspace(props: ProjectTaskWorkspaceProps) {
  const writable = useTaskDocumentTree(props.specId, props.task.id).data?.writable !== false;
  const queryClient = useQueryClient();

  return (
    <TaskDocumentEditorHost
      specId={props.specId}
      taskId={props.task.id}
      writable={writable}
      // Exit gates and process artifacts read the Task's documents: a save can change what the
      // projection allows, and the document tree (revisions).
      onSaved={() =>
        void queryClient.invalidateQueries({
          queryKey: taskAuthoringKeys.all(props.specId),
        })
      }
    >
      <Workspace {...props} />
    </TaskDocumentEditorHost>
  );
}

function Workspace({
  specId,
  task,
  resource,
  onBack,
  backHref,
  stale,
  onRetry,
  reload,
  onOpenHistory,
}: ProjectTaskWorkspaceProps) {
  const { t } = useTranslation();
  const navigation = useSecondaryNavigation();
  const projection = useTaskActions(specId, task.id);
  const workspace = useSpecificationWorkspace(specId);
  const [editing, setEditing] = useState(false);
  const typeTitle = task.snapshot?.taskType?.label ?? resource.type;
  const names: ContextNames = {
    taskDocuments: new Map(resource.documents.map((document) => [document.id, document.path])),
    specificationDocuments: new Map(
      (workspace.data?.documents ?? []).map((document) => [document.id, document.title]),
    ),
  };
  const view = viewOf(resource, projection.data?.taskAuthoring);
  const openDocument = (documentId: string) => {
    const path = resource.documents.find((document) => document.id === documentId)?.path;
    void navigation.openTab(taskDocumentStack, {
      documentId,
      name: path?.split('/').at(-1) ?? documentId,
    });
  };

  const lifecycle = useTaskLifecycle({
    specId,
    taskId: task.id,
    revision: resource.revision,
    lifecycle: projection.data?.task,
    missingContext: view.blocking.map((row) => entryName(row.entry, names)),
    onEditDetails: () => setEditing(true),
    onRemoved: onBack,
  });
  // The history is closed by default; the header's clock opens it at every width (UX contract).
  const historyAction: WorkspaceHeaderAction[] = [
    {
      id: 'history',
      label: t('specification.taskFullHistoryHeading'),
      icon: 'clock',
      presentation: 'icon',
      direct: 'always',
      onPress: onOpenHistory,
    },
  ];
  const current = versionOf(task);

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
              title={t('specification.viewTasks')}
              as="span"
              identityContent={
                <ApplicationLocationIdentity
                  title={t('specification.viewTasks')}
                  view="task"
                  specId={specId}
                  detailLabel={task.id}
                />
              }
              icon="list-checks"
              labels={{ moreActions: t('common.moreActions') }}
              actions={[...historyAction, ...lifecycle.actions]}
            />
          }
        >
          <AppContent className="w-content-xwide max-w-full">
            <AppWorkspaceBody scroll="area" contentClassName="py-6">
              <AppContentContainer align="start" size="full">
                <ApplicationContextLine specId={specId} view="task" />
                {stale ? (
                  <Alert tone="attention" title={t('taskDetails.pageFailed')}>
                    <Button variant="secondary" size="sm" onClick={onRetry}>
                      {t('common.retry')}
                    </Button>
                  </Alert>
                ) : null}
                <FullTaskView task={task} specKey={specId} onBack={onBack} backHref={backHref}>
                  <TaskAuthoringView
                    specId={specId}
                    task={task}
                    resource={resource}
                    typeTitle={typeTitle}
                    projection={projection.data}
                    projectionFailed={projection.isError}
                    onRetryProjection={() => void projection.refetch()}
                    workspace={workspace.data}
                    contextView={view}
                    contextNames={names}
                    lifecycleError={lifecycle.directError}
                    onOpenDocument={openDocument}
                    onReload={() => void reload()}
                  />
                </FullTaskView>
              </AppContentContainer>
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
      </AppWorkspace>
      {lifecycle.dialogs}
      {current ? (
        <EditTaskDetailsDialog
          specId={specId}
          taskId={task.id}
          typeTitle={typeTitle}
          open={editing}
          onOpenChange={setEditing}
          current={current}
          reload={async () => versionOf(await reload())}
        />
      ) : null}
    </>
  );
}
