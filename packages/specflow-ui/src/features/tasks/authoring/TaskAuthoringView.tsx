import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { Alert, Button, InlineNote, Typography, useWorkspaceCapabilities } from '@nevo/ui';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import type { SpecificationWorkspaceData } from '../../specs/read-model';
import type { FullTaskData } from '../read-model/model';
import { TaskContextSection } from './context/TaskContextSection';
import type { ContextNames } from './context/contextPresentation';
import type { ContextView, TaskContextEntry } from './context/contextModel';
import { TaskDependenciesSection } from './dependencies/TaskDependenciesSection';
import type { DependencyTask } from './dependencies/dependencyModel';
import { TaskDocumentsSection } from './documents/TaskDocumentsSection';
import { RefusalAlert } from './RefusalAlert';

export interface TaskAuthoringViewProps {
  readonly specId: string;
  readonly task: FullTaskData;
  readonly resource: TaskResourceFacts;
  readonly typeTitle: string;
  readonly projection: WorkflowActionProjection | undefined;
  readonly projectionFailed: boolean;
  readonly onRetryProjection: () => void;
  readonly workspace: SpecificationWorkspaceData | undefined;
  readonly contextView: ContextView;
  readonly contextNames: ContextNames;
  /** A lifecycle action that acted directly (Approve, Resume) and was refused. */
  readonly lifecycleError: unknown;
  readonly onOpenDocument: (documentId: string) => void;
  readonly onReload: () => void;
}

/**
 * The project-mode Full Task: identity, preparation status and summary, then the authoring
 * sections where their facts are read (Documents, Context, Depends on). Every edit is allowed by the
 * Task projection; the Engine decides and refuses, the page only renders.
 */
export function TaskAuthoringView({
  specId,
  task,
  resource,
  typeTitle,
  projection,
  projectionFailed,
  onRetryProjection,
  workspace,
  contextView,
  contextNames,
  lifecycleError,
  onOpenDocument,
  onReload,
}: TaskAuthoringViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const { supportsSplit } = useWorkspaceCapabilities();
  const lifecycle = projection?.task;
  const otherTasks: DependencyTask[] = (workspace?.taskGroups ?? []).flatMap((group) =>
    group.tasks.map((other) => ({
      id: other.id,
      title: other.title,
      statusLabel: other.statusId
        ? t(`taskAuthoring.status.${other.statusId}`, { defaultValue: other.statusId })
        : other.status,
      ...(other.typeTitle ? { typeTitle: other.typeTitle } : {}),
      ...(other.dependsOn ? { dependsOn: other.dependsOn } : {}),
    })),
  );
  const openTarget = (entry: TaskContextEntry) => {
    if (entry.kind === 'task-document') {
      return () => onOpenDocument(entry.id);
    }

    if (
      entry.kind === 'specification-document' &&
      contextNames.specificationDocuments.has(entry.id)
    ) {
      return () =>
        void navigate({
          to: '/specs/$specId/documents/$documentId',
          params: { specId, documentId: entry.id },
          search: { collection },
        });
    }

    return undefined;
  };

  const statusChangeReason = resource.statusChange?.reason;

  return (
    <div className="@container/task grid min-w-0">
      <div className="grid gap-1 pb-4 @min-[40rem]/task:pb-5">
        <Typography
          as="h1"
          tabIndex={-1}
          data-page-title
          variant="title-lg"
          className="text-content-primary outline-none [overflow-wrap:anywhere]"
        >
          {task.title}
        </Typography>
        <Typography variant="body-sm" className="text-content-muted">
          <span className="font-mono">{task.id}</span>
          {` · ${typeTitle}`}
        </Typography>
        {resource.status === 'draft' ? (
          <InlineNote tone="attention" className="mt-2">
            <span className="font-medium text-content-primary">
              {t('taskAuthoring.page.draft')}
            </span>
            {` · ${t('taskAuthoring.page.draftNotice')}`}
          </InlineNote>
        ) : resource.status === 'on-hold' || resource.status === 'cancelled' ? (
          <InlineNote tone={resource.status === 'on-hold' ? 'attention' : 'info'} className="mt-2">
            <span className="font-medium text-content-primary">
              {resource.status === 'on-hold'
                ? t('taskAuthoring.page.onHold')
                : t('taskAuthoring.page.cancelled')}
            </span>
            {statusChangeReason ? `: ${statusChangeReason}` : null}
          </InlineNote>
        ) : null}
        {task.snapshot?.summary ? (
          <Typography as="p" variant="body-md" className="mt-2 text-content-secondary">
            {task.snapshot.summary}
          </Typography>
        ) : null}
        {lifecycleError ? (
          <div className="mt-3">
            <RefusalAlert error={lifecycleError} />
          </div>
        ) : null}
        {projectionFailed ? (
          <Alert
            className="mt-3"
            tone="attention"
            title={t('taskAuthoring.page.loadFailed')}
            actions={
              <Button size="sm" variant="secondary" onClick={onRetryProjection}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}
      </div>
      {/*
        T11 slot: the Now block (workflow position, blocking reasons, latest hand-off and the one
        primary action, from the workflow projection) is rendered here, directly under the summary.
      */}
      <TaskDocumentsSection
        specId={specId}
        taskId={task.id}
        collapsible={!supportsSplit}
        onOpenDocument={onOpenDocument}
      />
      <TaskContextSection
        specId={specId}
        specTitle={workspace?.title ?? specId}
        taskId={task.id}
        revision={resource.revision}
        view={contextView}
        names={contextNames}
        specificationDocuments={(workspace?.documents ?? []).map((document) => ({
          id: document.id,
          title: document.title,
          ...(document.filename ? { filename: document.filename } : {}),
        }))}
        editable={lifecycle?.editContext.kind === 'allowed'}
        collapsible={!supportsSplit}
        openTarget={openTarget}
        onLoadLatest={onReload}
      />
      <TaskDependenciesSection
        specId={specId}
        taskId={task.id}
        revision={resource.revision}
        dependsOn={resource.dependsOn}
        tasks={otherTasks}
        editable={lifecycle?.editDependencies.kind === 'allowed'}
        started={resource.position.state !== 'not-started'}
        collapsible={!supportsSplit}
        onOpenTask={(taskId) =>
          void navigate({
            to: '/specs/$specId/tasks/$taskId',
            params: { specId, taskId },
            search: { collection },
          })
        }
        onLoadLatest={onReload}
      />
    </div>
  );
}
