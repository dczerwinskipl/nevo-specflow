import { useId, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  InlineNote,
  Link,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
} from '@nevo/ui';
import type { GateStatus } from '@nevo/specflow-contracts/workflow';
import type { TaskOverview } from '@nevo/specflow-contracts/specs/workspace';
import type { TaskProgressData } from '../../../specs/read-model';
import { tasksProgressText, terminalSummary } from '../../overview/progress';
import { WorkflowNow } from '../WorkflowNow';
import { documentGateFix, stepPurpose } from '../presentation';
import {
  SPECIFICATION_NOW_HEADING,
  useSpecificationNowVisible,
  useSpecificationWorkflow,
} from './SpecificationWorkflow';

type StuckTask = NonNullable<TaskOverview['stuck']>[number];

/**
 * The Tasks bar fills in the success tone: done work, told apart from the step track's info-toned
 * current step above it.
 */
const doneFill = { '--color-progress-fill': 'var(--color-status-success)' } as CSSProperties;

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
        // One continuous bar with its label to the right, like the step track: never a second
        // segmented track. What it counts is the label's tooltip.
        <div
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 @max-[40rem]/app-content:flex-col @max-[40rem]/app-content:items-start"
          data-now-tasks-progress=""
        >
          {/* A bounded bar (the step track's width), so its label stays beside it. */}
          <div className="w-40 max-w-full shrink-0">
            <Progress
              value={progress.completed}
              max={progress.total}
              style={doneFill}
              aria-labelledby={progressId}
            />
          </div>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Typography
                  as="p"
                  variant="body-sm"
                  id={progressId}
                  tabIndex={0}
                  className="min-w-0 cursor-default text-content-secondary underline decoration-dotted decoration-content-muted underline-offset-4"
                >
                  {tasksProgressText(progress, t)}
                </Typography>
              </TooltipTrigger>
              <TooltipContent>
                {t(
                  progress.ended
                    ? 'taskOverview.progress.barNoteEnded'
                    : 'taskOverview.progress.barNote',
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

  return (
    <WorkflowNow
      subject={{ specId: workflow.specId }}
      projection={projection}
      headingId={SPECIFICATION_NOW_HEADING}
      links={{ tasks: () => workflow.openTasks(), attempt: onOpenHistory }}
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
}
