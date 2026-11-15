import { useId, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNote, Link, Progress, Typography } from '@nevo/ui';
import type { GateStatus } from '@nevo/specflow-contracts/workflow';
import type { TaskOverview } from '@nevo/specflow-contracts/specs/workspace';
import type { TaskProgressData } from '../../../specs/read-model';
import { progressText, terminalSummary } from '../../overview/progress';
import { WorkflowNow } from '../WorkflowNow';
import {
  SPECIFICATION_NOW_HEADING,
  useSpecificationNowVisible,
  useSpecificationWorkflow,
} from './SpecificationWorkflow';

type StuckTask = NonNullable<TaskOverview['stuck']>[number];

/**
 * The Specification's Now block on its Overview, in the preparation block's place: with a workflow
 * (project Runtime, current Specification) the block, else `fallback`. A `wait` step shows the Task
 * progress (only here) and, when it cannot continue, why, naming the Tasks; it offers no action.
 * Once the workflow ended, Close specification is its one action.
 */
export function SpecificationNow({
  documents,
  fallback,
  progress,
  stuck,
  fullTaskHref,
  onOpenTask,
  onOpenDocument,
  onOpenHistory,
  documentName,
}: {
  /** The Specification's documents, offered as finish artifacts. */
  readonly documents: readonly { readonly value: string; readonly label: string }[];
  /** The file name of a registered document (a gate's `specification.md`). */
  readonly documentName: (documentId: string) => string | undefined;
  readonly fallback: ReactNode;
  readonly progress?: TaskProgressData;
  /** Why the wait cannot continue (the Runtime's `tasks-stuck` Tasks). */
  readonly stuck?: TaskOverview['stuck'];
  readonly fullTaskHref: (taskId: string) => string;
  readonly onOpenTask: (taskId: string) => void;
  readonly onOpenDocument: (documentId: string) => void;
  readonly onOpenHistory: () => void;
}) {
  const { t } = useTranslation();
  const progressId = useId();
  const workflow = useSpecificationWorkflow();
  const visible = useSpecificationNowVisible();
  const projection = workflow?.projection;
  if (!workflow || !visible) {
    return fallback;
  }

  if (!projection) {
    // Loading or unavailable: the block appears once the projection is read.
    return null;
  }

  const { position } = projection;
  const terminal = position.kind === 'terminal';
  const abandonment = terminal ? position.abandonment : undefined;
  const taskLink = (task: StuckTask) => (
    <Link
      href={fullTaskHref(task.taskId)}
      className="font-medium"
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        onOpenTask(task.taskId);
      }}
    >
      {task.taskId}
    </Link>
  );
  const waitingContent = (
    <>
      {progress && progress.total > 0 ? (
        <div className="grid max-w-md gap-1.5">
          <Progress
            variant="segmented"
            completed={progress.completed}
            total={progress.total}
            aria-labelledby={progressId}
          />
          <Typography as="p" variant="body-sm" id={progressId} className="text-content-secondary">
            {t('taskOverview.progress.label', { progress: progressText(progress, t) })}
            <span className="block text-content-muted">
              {t(
                progress.ended
                  ? 'taskOverview.progress.barNoteEnded'
                  : 'taskOverview.progress.barNote',
              )}
            </span>
          </Typography>
        </div>
      ) : null}
      {stuck && stuck.length > 0 ? (
        <InlineNote tone="attention" icon="circle-alert" data-now-stuck="">
          {t('taskOverview.stuck.before')}{' '}
          {stuck.map((task, index) => (
            <span key={task.taskId}>
              {index > 0 ? ', ' : null}
              {taskLink(task)} {t(`taskOverview.stuck.cause.${task.cause}`)}
            </span>
          ))}{' '}
          {t('taskOverview.stuck.after')}
        </InlineNote>
      ) : null}
    </>
  );
  const summary = terminal && progress ? terminalSummary(progress, position.outcome, t) : undefined;
  const gateAction = (gate: GateStatus) => {
    if (gate.scope.kind !== 'specification' || !gate.documentId) {
      return undefined;
    }

    const documentId = gate.documentId;
    const name = documentName(documentId) ?? documentId;

    return {
      label: t('workflowExecution.now.openDocument', { name }),
      onSelect: () => onOpenDocument(documentId),
    };
  };

  return (
    <WorkflowNow
      subject={{ specId: workflow.specId }}
      projection={projection}
      headingId={SPECIFICATION_NOW_HEADING}
      links={{ tasks: () => workflow.openTasks() }}
      primaryAction={
        terminal && projection.specification?.exit ? (
          <Button onClick={() => workflow.openExit('close')}>
            {t('workflowExecution.close.action')}
          </Button>
        ) : undefined
      }
      artifactOptions={documents}
      gateAction={gateAction}
      overview={{
        specId: workflow.specId,
        onOpenHistory,
        waitingContent,
        ...(abandonment
          ? {
              // One archive icon, on the title; the reason under it, said once.
              titleNote: (
                <Typography as="p" variant="body-sm" className="text-content-primary">
                  {abandonment.reason}
                </Typography>
              ),
            }
          : {}),
        ...(summary
          ? {
              summary: (
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  {summary}
                </Typography>
              ),
            }
          : {}),
      }}
    />
  );
}
