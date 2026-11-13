import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNote } from '@nevo/ui';
import type {
  FinishWorkflowResult,
  GateStatus,
  WorkflowActionProjection,
} from '@nevo/specflow-contracts/workflow';
import type { WorkflowSubjectRef } from './api';
import {
  attemptKeyOf,
  FinishStepDialog,
  type ArtifactOption,
  type FinishDraft,
} from './FinishStepDialog';
import type { GateAction } from './GateList';
import { NowBlock } from './NowBlock';
import { ReturnStepDialog } from './ReturnStepDialog';
import { StartTaskDialog, type PinPreview } from './StartTaskDialog';
import type { NowLinks } from './StartBlockerLines';
import { useWorkflowCommands } from './useWorkflowCommands';
import { WorkflowRefusalAlert } from './WorkflowRefusalAlert';

type FailedPostAction = Extract<
  NonNullable<FinishWorkflowResult['postActions']>[number],
  { status: 'failed' }
>;

export interface WorkflowNowProps {
  readonly subject: WorkflowSubjectRef;
  readonly projection: WorkflowActionProjection;
  readonly headingId: string;
  readonly status?: ReactNode;
  readonly links: NowLinks;
  /** A lifecycle primary (Approve, Resume) or Close: it replaces the workflow actions. */
  readonly primaryAction?: ReactNode;
  /** A Task's first start confirms its binding; absent: a start acts directly. */
  readonly firstStart?: {
    readonly taskId: string;
    readonly typeTitle: string;
    readonly onCancelTask?: () => void;
    readonly onRemoveTask?: () => void;
  };
  readonly artifactOptions: readonly ArtifactOption[];
  /** What resolves an unmet gate here (Create findings document). */
  readonly gateAction?: (gate: GateStatus) => GateAction | undefined;
}

const emptyDraft = (attemptKey: string): FinishDraft => ({
  attemptKey,
  feedback: '',
  artifacts: [],
});

function previewOf(position: WorkflowActionProjection['position']): PinPreview | undefined {
  return position.kind === 'not-started' || position.kind === 'blocked'
    ? position.preview
    : undefined;
}

/**
 * The Now block with its workflow actions: Start (a Task's first start confirms its binding), Finish
 * step and Return to an earlier step, each from the projection. The finish draft lives here, so a
 * gate action can close the Finish dialog and the owner can come back to it unchanged.
 */
export function WorkflowNow({
  subject,
  projection,
  headingId,
  status,
  links,
  primaryAction,
  firstStart,
  artifactOptions,
  gateAction,
}: WorkflowNowProps) {
  const { t } = useTranslation();
  const commands = useWorkflowCommands(subject);
  const { actions, position } = projection;
  const finish = actions.finish;
  const attemptKey = finish ? attemptKeyOf(finish) : '';
  const [dialog, setDialog] = useState<'start' | 'finish' | 'return'>();
  const [storedDraft, setDraft] = useState<FinishDraft>();
  // A draft of another attempt (the run moved on) is not this attempt's draft.
  const draft = storedDraft?.attemptKey === attemptKey ? storedDraft : emptyDraft(attemptKey);
  const [kept, setKept] = useState(false);
  const [confirmed, setConfirmed] = useState<PinPreview>();
  const [failedPostActions, setFailedPostActions] = useState<readonly FailedPostAction[]>([]);
  const preview = previewOf(position);
  const next =
    position.kind === 'not-started' || position.kind === 'ready' ? position.next : undefined;
  const step = position.kind === 'active' ? position.step : undefined;
  const busy = commands.start.isPending || commands.finish.isPending || commands.returnTo.isPending;

  const startNow = () => {
    commands.start.reset();
    if (actions.start?.firstStart && firstStart && preview) {
      setConfirmed(undefined);
      setDialog('start');

      return;
    }

    commands.start.mutate({});
  };

  const confirmStart = () => {
    if (!preview) {
      return;
    }

    setConfirmed(preview);
    commands.start.mutate(
      {
        expectedWorkflowRevision: actions.start?.expectedWorkflowRevision ?? preview.revision,
      },
      { onSuccess: () => setDialog(undefined) },
    );
  };

  const openFinish = () => {
    commands.finish.reset();
    setDialog('finish');
  };

  const submitFinish = () => {
    const selected = finish?.transitions.find((transition) => transition.id === draft.transitionId);
    if (!finish || !selected) {
      return;
    }

    const feedback = draft.feedback.trim();
    commands.finish.mutate(
      {
        step: finish.step,
        attempt: finish.attempt,
        ...(selected.result !== undefined ? { result: selected.result } : {}),
        ...(feedback ? { feedback } : {}),
        ...(draft.artifacts.length > 0 ? { artifacts: [...draft.artifacts] } : {}),
        // A manual finish of a step that produces Tasks proposes none: the Tasks the owner created
        // stay as they are.
        ...(step?.produces === 'tasks' ? { tasks: [] } : {}),
      },
      {
        onSuccess: (result) => {
          setDialog(undefined);
          setDraft(undefined);
          setKept(false);
          setFailedPostActions(
            (result.postActions ?? []).filter(
              (action): action is FailedPostAction => action.status === 'failed',
            ),
          );
        },
      },
    );
  };

  const finishGateAction = (gate: GateStatus): GateAction | undefined => {
    const action = gateAction?.(gate);

    return action
      ? {
          label: action.label,
          onSelect: () => {
            // The draft stays; Finish step reopens it and the gates are read again.
            setDialog(undefined);
            setKept(true);
            action.onSelect();
          },
        }
      : undefined;
  };

  const workflowActions =
    primaryAction ??
    (actions.start || finish || actions.return ? (
      <>
        {actions.start && next ? (
          <Button onClick={startNow} disabled={busy}>
            {t('workflowExecution.now.start', { step: next.step.title || next.step.id })}
          </Button>
        ) : null}
        {finish ? (
          <Button onClick={openFinish} disabled={busy}>
            {t('workflowExecution.now.finish')}
          </Button>
        ) : null}
        {actions.return ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              commands.returnTo.reset();
              setDialog('return');
            }}
          >
            {t('workflowExecution.now.return')}
          </Button>
        ) : null}
      </>
    ) : undefined);

  const note = (
    <>
      {kept && finish && draft.transitionId ? (
        <InlineNote tone="info">{t('workflowExecution.now.finishKept')}</InlineNote>
      ) : null}
      {failedPostActions.map((action) => (
        <InlineNote key={action.action} tone="attention">
          {t('workflowExecution.now.postActionFailed', { code: action.code })}
        </InlineNote>
      ))}
      {dialog !== 'start' && commands.start.isError ? (
        <WorkflowRefusalAlert error={commands.start.error} />
      ) : null}
    </>
  );

  return (
    <>
      <NowBlock
        projection={projection}
        headingId={headingId}
        status={status}
        links={links}
        gateActionFor={gateAction ? finishGateAction : undefined}
        note={note}
        actions={workflowActions}
      />
      {firstStart && preview ? (
        <StartTaskDialog
          open={dialog === 'start'}
          onOpenChange={(open) => !open && setDialog(undefined)}
          taskId={firstStart.taskId}
          typeTitle={firstStart.typeTitle}
          preview={preview}
          {...(confirmed ? { confirmed } : {})}
          pending={commands.start.isPending}
          error={commands.start.error}
          onConfirm={confirmStart}
          {...(firstStart.onCancelTask
            ? {
                onCancelTask: () => {
                  setDialog(undefined);
                  firstStart.onCancelTask?.();
                },
              }
            : {})}
          {...(firstStart.onRemoveTask
            ? {
                onRemoveTask: () => {
                  setDialog(undefined);
                  firstStart.onRemoveTask?.();
                },
              }
            : {})}
        />
      ) : null}
      {finish && step ? (
        <FinishStepDialog
          open={dialog === 'finish'}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(undefined);
            }
          }}
          stepTitle={step.title || step.id}
          finish={finish}
          draft={draft}
          onDraftChange={setDraft}
          rechecked={kept}
          artifactOptions={artifactOptions}
          gateActionFor={gateAction ? finishGateAction : undefined}
          producesTasks={step.produces === 'tasks'}
          pending={commands.finish.isPending}
          error={commands.finish.error}
          onSubmit={submitFinish}
        />
      ) : null}
      {actions.return ? (
        <ReturnStepDialog
          open={dialog === 'return'}
          onOpenChange={(open) => !open && setDialog(undefined)}
          {...(step ? { currentTitle: step.title || step.id } : {})}
          targets={actions.return.targets}
          pending={commands.returnTo.isPending}
          error={commands.returnTo.error}
          onSubmit={({ step: target, reason }) =>
            commands.returnTo.mutate(
              { step: target, ...(reason ? { reason } : {}) },
              { onSuccess: () => setDialog(undefined) },
            )
          }
        />
      ) : null}
    </>
  );
}
