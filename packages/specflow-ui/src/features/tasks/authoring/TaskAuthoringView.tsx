import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { Alert, Button, Icon, InlineNote, Typography } from '@nevo/ui';
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
import { TaskNow, type LifecyclePrimary } from '../execution/TaskNow';
import type { AttemptRef } from '../execution/StartBlockerLines';
import { productIcons } from '../../../shared/product-icons';

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
  /** Approve or Resume: the Now block's one primary action. */
  readonly lifecyclePrimary?: LifecyclePrimary;
  readonly onCancelTask?: () => void;
  readonly onRemoveTask?: () => void;
  readonly onOpenDocument: (documentId: string) => void;
  /** Opens the Task history (also offered in Now's ⋯ menu). */
  readonly onOpenHistory?: () => void;
  /** Opens the Task history at an attempt, its feedback open. */
  readonly onOpenFeedback?: (attempt: AttemptRef) => void;
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
  lifecyclePrimary,
  onCancelTask,
  onRemoveTask,
  onOpenDocument,
  onOpenHistory,
  onOpenFeedback,
  onReload,
}: TaskAuthoringViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const lifecycle = projection?.task;
  const otherTasks: DependencyTask[] = (workspace?.taskGroups ?? []).flatMap((group) =>
    group.tasks.map((other) => ({
      id: other.id,
      title: other.title,
      statusLabel: other.statusId
        ? t(`taskAuthoring.status.${other.statusId}`, { defaultValue: other.statusId })
        : other.status,
      ...(other.typeTitle ? { typeTitle: other.typeTitle } : {}),
      ...(other.statusId ? { statusId: other.statusId } : {}),
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
  // The Now block leads with an on-hold Task's hold and its reason; the header does not repeat it.
  const nowShown = projection !== undefined && resource.status !== 'cancelled';

  return (
    // Below a 40rem page Now is a flush band: its edge separates it, so the section after it drops
    // its divider (A1).
    <div className="@container/task grid min-w-0 @max-[40rem]/app-content:[&>[data-task-now]+*]:border-t-0">
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
        {/* What the page is: its type, by icon and name, and the Task type. Its key names the page in
          the header and the trail (interaction-model.md "Page identity"). */}
        <Typography
          variant="body-sm"
          className="flex min-w-0 items-center gap-1.5 text-content-muted"
          data-page-kind=""
        >
          <Icon name={productIcons.task.item} size="sm" className="text-content-secondary" />
          <span className="min-w-0">
            <span className="font-medium text-content-secondary">
              {t('taskAuthoring.page.kind')}
            </span>
            {` · ${typeTitle}`}
          </span>
        </Typography>
        {/* The status with its own glyph and a neutral tone: a status alone is not attention. */}
        {resource.status === 'draft' ? (
          <InlineNote icon="edit" className="mt-2">
            <span className="font-medium text-content-primary">
              {t('taskAuthoring.page.draft')}
            </span>
            {` · ${t('taskAuthoring.page.draftNotice')}`}
          </InlineNote>
        ) : (resource.status === 'on-hold' && !nowShown) || resource.status === 'cancelled' ? (
          <InlineNote
            icon={resource.status === 'on-hold' ? 'circle-pause' : 'close'}
            className="mt-2"
          >
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
      {/* The Now block, directly under the summary; a cancelled Task has no workflow section. */}
      {projection && nowShown ? (
        <TaskNow
          specId={specId}
          taskId={task.id}
          typeTitle={typeTitle}
          resource={resource}
          projection={projection}
          {...(lifecyclePrimary ? { primary: lifecyclePrimary } : {})}
          {...(onCancelTask ? { onCancelTask } : {})}
          {...(onRemoveTask ? { onRemoveTask } : {})}
          onOpenDocument={onOpenDocument}
          {...(onOpenHistory ? { onOpenHistory } : {})}
          {...(onOpenFeedback ? { onOpenFeedback } : {})}
        />
      ) : null}
      <TaskDocumentsSection
        specId={specId}
        taskId={task.id}
        ownContext={contextView.explicit}
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
        openTarget={openTarget}
        onLoadLatest={onReload}
        started={resource.position.state !== 'not-started'}
      />
      <TaskDependenciesSection
        specId={specId}
        taskId={task.id}
        taskTitle={task.title || task.id}
        revision={resource.revision}
        dependsOn={resource.dependsOn}
        tasks={otherTasks}
        candidates={projection?.taskAuthoring?.dependencyCandidates ?? []}
        editable={lifecycle?.editDependencies.kind === 'allowed'}
        started={resource.position.state !== 'not-started'}
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
