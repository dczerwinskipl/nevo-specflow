import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, InlineNote, Link, Typography } from '@nevo/ui';
import type { GateStatus } from '@nevo/specflow-contracts/workflow';
import type { TaskOverview } from '@nevo/specflow-contracts/specs/workspace';
import type { TaskProgressData } from '../../../specs/read-model';
import { terminalSummary } from '../../overview/progress';
import { TaskProgress } from '../progress/TaskProgress';
import { WorkflowNow } from '../WorkflowNow';
import type { AttemptRef } from '../StartBlockerLines';
import { documentGateFix, stepPurpose } from '../presentation';
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
  ready,
  stuck,
  fullTaskHref,
  onOpenTask,
  onOpenDocument,
  onOpenHistory,
  onOpenFeedback,
  documentName,
}: {
  /** The Specification's documents, offered as finish artifacts. */
  readonly documents: readonly { readonly value: string; readonly label: string }[];
  /** The file name of a registered document (a gate's `specification.md`). */
  readonly documentName: (documentId: string) => string | undefined;
  readonly fallback: ReactNode;
  readonly progress?: TaskProgressData;
  /** The Tasks that can start now (the Runtime's "Ready to start" group count), when known. */
  readonly ready?: number;
  /** Why the wait cannot continue (the Runtime's `tasks-stuck` Tasks). */
  readonly stuck?: TaskOverview['stuck'];
  readonly fullTaskHref: (taskId: string) => string;
  readonly onOpenTask: (taskId: string) => void;
  readonly onOpenDocument: (documentId: string) => void;
  readonly onOpenHistory: () => void;
  /** Opens the Activity history at an attempt, its feedback open. */
  readonly onOpenFeedback: (attempt: AttemptRef) => void;
}) {
  const { t } = useTranslation();
  const workflow = useSpecificationWorkflow();
  const visible = useSpecificationNowVisible();
  const projection = workflow?.projection;
  if (!workflow || !visible) {
    return fallback;
  }

  const readFailure = workflow.readFailed ? (
    <Alert
      tone="attention"
      role={projection ? 'status' : 'alert'}
      title={t(projection ? 'workflowExecution.now.readStale' : 'workflowExecution.now.readFailed')}
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={workflow.retrying}
        onClick={workflow.retryRead}
      >
        {t('workflowExecution.now.readRetry')}
      </Button>
    </Alert>
  ) : null;
  if (!projection) {
    // Loading: the block appears once the projection is read. A failed read says so, with Retry.
    return readFailure;
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
      {task.title ?? task.taskId}
    </Link>
  );
  const waitingContent = (
    <>
      {progress && progress.total > 0 ? (
        <TaskProgress progress={progress} {...(ready ? { ready } : {})} />
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
  const terminalText =
    terminal && progress ? terminalSummary(progress, position.outcome, t) : undefined;
  // The step's position is the Now block's step track; the purpose follows the quiet line.
  const purpose = stepPurpose(position);
  const summary = terminalText ? (
    <Typography as="p" variant="body-sm" className="text-content-secondary">
      {terminalText}
    </Typography>
  ) : purpose ? (
    <Typography as="p" variant="body-md" className="text-content-primary" data-now-purpose="">
      {purpose}
    </Typography>
  ) : undefined;
  const gateAction = (gate: GateStatus) => {
    if (gate.scope.kind !== 'specification' || !gate.documentId) {
      return undefined;
    }

    const documentId = gate.documentId;

    return {
      ...documentGateFix(t, gate, documentName(documentId) ?? documentId),
      onSelect: () => onOpenDocument(documentId),
    };
  };

  const block = (
    <WorkflowNow
      subject={{ specId: workflow.specId }}
      projection={projection}
      headingId={SPECIFICATION_NOW_HEADING}
      links={{
        tasks: () => workflow.openTasks(),
        attempt: onOpenHistory,
        // The Activity history holds every attempt with its feedback, a person's too; a return names
        // no attempt, so the history opens at its top, as the Task's does.
        feedback: (source) => (source ? () => onOpenFeedback(source) : onOpenHistory),
      }}
      primaryAction={
        terminal && projection.specification?.exit ? (
          projection.specification.exit.close.kind === 'unavailable' ? (
            <Typography as="p" variant="body-sm" className="text-content-muted">
              {t('workflowExecution.close.noRepository')}
            </Typography>
          ) : (
            <Button onClick={() => workflow.openExit('close')}>
              {t('workflowExecution.close.action')}
            </Button>
          )
        ) : undefined
      }
      artifactOptions={documents}
      gateAction={gateAction}
      gateDocument={(gate) =>
        gate.scope.kind === 'specification' && gate.documentId
          ? documentName(gate.documentId)
          : undefined
      }
      onOpenHistory={onOpenHistory}
      {...(summary ? { summary } : {})}
      specification={{
        specId: workflow.specId,
        ...(workflow.openNewTask ? { onNewTask: workflow.openNewTask } : {}),
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
      }}
    />
  );

  // A failed refresh keeps the last projection, so Stop, Take over and Return stay reachable.
  return readFailure ? (
    <div className="grid gap-3">
      {readFailure}
      {block}
    </div>
  ) : (
    block
  );
}
