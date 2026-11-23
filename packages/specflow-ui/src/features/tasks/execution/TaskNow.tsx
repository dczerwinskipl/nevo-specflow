import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@nevo/ui';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useTaskDocumentOperations } from '../authoring/documents/useTaskDocumentOperations';
import { RefusalAlert } from '../authoring/RefusalAlert';
import type { GateAction } from './GateList';
import { goToHeading, InlineAction } from './InlineAction';
import { documentGateFix, stepGoal } from './presentation';
import { WorkflowNow } from './WorkflowNow';

/** The Task's lifecycle primary (Approve or Resume), when the projection allows one. */
export interface LifecyclePrimary {
  readonly label: string;
  readonly busy: boolean;
  readonly onPress: () => void;
}

export interface TaskNowProps {
  readonly specId: string;
  readonly taskId: string;
  readonly typeTitle: string;
  readonly resource: TaskResourceFacts;
  readonly projection: WorkflowActionProjection;
  readonly primary?: LifecyclePrimary;
  readonly onCancelTask?: () => void;
  readonly onRemoveTask?: () => void;
  readonly onOpenDocument: (documentId: string) => void;
  /** Opens the Task history (the ⋯ menu's Workflow history). */
  readonly onOpenHistory?: () => void;
}

/**
 * What the step is for: its purpose, else the first paragraph of its instructions (three lines,
 * Show more for the rest).
 */
function TaskGoal({ goal }: { goal: { readonly text: string; readonly more?: string } }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const fromInstructions = goal.more !== undefined;

  return (
    <div className="grid gap-1" data-now-goal="">
      <Typography as="p" variant="label-sm" className="text-content-secondary">
        {t('workflowExecution.now.goal')}
      </Typography>
      <Typography
        as="p"
        variant="body-md"
        className={
          fromInstructions
            ? expanded
              ? 'whitespace-pre-line text-content-primary [overflow-wrap:anywhere]'
              : 'line-clamp-3 text-content-primary [overflow-wrap:anywhere]'
            : 'text-content-primary [overflow-wrap:anywhere]'
        }
      >
        {expanded && goal.more ? goal.more : goal.text}
      </Typography>
      {fromInstructions ? (
        <InlineAction
          className="w-fit text-body-sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t('workflowExecution.now.showLess') : t('workflowExecution.now.showMore')}
        </InlineAction>
      ) : null}
    </div>
  );
}

/**
 * The Now block of a Task: its step, Goal and "Done when", the latest hand-off and one main action
 * (Approve or Resume while the Task is a draft or on hold). An unmet exit gate whose document
 * exists makes opening it the main action, with Finish step beside it; a missing Task document of
 * an exit gate is created from the gate and opened in the Secondary editor, and the finish draft
 * is kept meanwhile. Return to an earlier step is in the ⋯ menu.
 */
export function TaskNow({
  specId,
  taskId,
  typeTitle,
  resource,
  projection,
  primary,
  onCancelTask,
  onRemoveTask,
  onOpenDocument,
  onOpenHistory,
}: TaskNowProps) {
  const { t } = useTranslation();
  const documents = useTaskDocumentOperations(specId, taskId);
  const goal = stepGoal(projection.position);
  const documentPath = (documentId: string) =>
    resource.documents.find((document) => document.id === documentId)?.path;

  const gateAction = (gate: GateStatus): GateAction | undefined => {
    if (gate.scope.kind !== 'task' || gate.scope.taskId !== taskId) {
      return undefined;
    }

    if (gate.documentId && gate.reason !== 'no-document') {
      const documentId = gate.documentId;

      return {
        ...documentGateFix(t, gate, documentPath(documentId) ?? documentId),
        onSelect: () => onOpenDocument(documentId),
      };
    }

    if (gate.reason !== 'no-document') {
      return undefined;
    }

    return {
      label: t('workflowExecution.gate.createDocument', { type: gate.documentType }),
      onSelect: () =>
        documents.create.mutate(
          { path: `${gate.documentType}.md`, type: gate.documentType },
          {
            onSuccess: (result) => {
              const created = result.documents[0];
              if (created) {
                onOpenDocument(created.id);
              }
            },
          },
        ),
    };
  };

  return (
    <div className="grid gap-3 pb-6 @max-[40rem]/app-content:pb-0" data-task-now="">
      <WorkflowNow
        subject={{ specId, taskId }}
        projection={projection}
        headingId="task-workflow-heading"
        links={{
          context: () => goToHeading('task-context-heading'),
          dependencies: () => goToHeading('task-dependencies-heading'),
          ...(onOpenHistory ? { attempt: onOpenHistory } : {}),
          // The agent's paths are checkout-relative; the Task's documents are its folder's.
          document: (path) => {
            const document = resource.documents.find((item) => path.endsWith(`/${item.path}`));
            if (document) {
              onOpenDocument(document.id);
            }

            return document !== undefined;
          },
        }}
        primaryAction={
          primary ? (
            <Button onClick={primary.onPress} disabled={primary.busy}>
              {primary.label}
            </Button>
          ) : undefined
        }
        firstStart={{
          taskId,
          typeTitle,
          ...(onCancelTask ? { onCancelTask } : {}),
          ...(onRemoveTask ? { onRemoveTask } : {}),
        }}
        artifactOptions={resource.documents.map((document) => ({
          value: document.path,
          label: document.path,
        }))}
        gateAction={gateAction}
        gateDocument={(gate) =>
          gate.scope.kind === 'task' && gate.scope.taskId === taskId && gate.documentId
            ? documentPath(gate.documentId)
            : undefined
        }
        {...(goal ? { summary: <TaskGoal key={goal.text} goal={goal} /> } : {})}
        {...(resource.status === 'on-hold'
          ? { hold: resource.statusChange?.reason ? { reason: resource.statusChange.reason } : {} }
          : {})}
        {...(onOpenHistory ? { onOpenHistory } : {})}
      />
      {documents.create.isError ? <RefusalAlert error={documents.create.error} /> : null}
    </div>
  );
}
