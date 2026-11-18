import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNote, Typography } from '@nevo/ui';
import { subscribeTaskAttention } from '../overview/attentionRequests';
import { NowOperationsMenu } from './NowOperationsMenu';
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
  type FinishTransition,
} from './FinishStepDialog';
import { closableInFinishDialog } from './FinishTasksOpen';
import type { GateAction } from './GateList';
import { NowBlock } from './NowBlock';
import { ReturnStepDialog } from './ReturnStepDialog';
import { StartTaskDialog, type PinPreview } from './StartTaskDialog';
import type { NowLinks } from './StartBlockerLines';
import { nowActionPlan } from './presentation';
import { useWorkflowCommands } from './useWorkflowCommands';
import { WorkflowRefusalAlert } from './WorkflowRefusalAlert';

type PostAction = NonNullable<FinishWorkflowResult['postActions']>[number];
type FailedPostAction = Extract<PostAction, { status: 'failed' }>;
type HeldPostAction = Extract<PostAction, { status: 'completed' }> & {
  readonly held: NonNullable<Extract<PostAction, { status: 'completed' }>['held']>;
};

/** What a finish's commit of the workflow state left to say, for the subject it finished. */
interface FinishCommitNote {
  readonly subjectKey: string;
  readonly failed: readonly FailedPostAction[];
  readonly held: readonly HeldPostAction[];
}

const subjectKeyOf = (subject: WorkflowSubjectRef): string =>
  `${subject.specId}/${subject.taskId ?? ''}`;

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
  /** Names the document that meets a gate (`findings.md`). */
  readonly gateDocument?: (gate: GateStatus) => string | undefined;
  /** Under the position: the step's purpose (Specification) or Goal (Task). */
  readonly summary?: ReactNode;
  /** Opens the subject's workflow history from the ⋯ menu. */
  readonly onOpenHistory?: () => void;
  /**
   * The Specification Overview's own parts: Start workflow, New task beside Finish step at a step
   * that produces Tasks, the wait step's Task progress, and a Requires attention "return" that
   * opens the Return dialog. Its Now leaves the latest hand-off to the history.
   */
  readonly specification?: {
    readonly specId: string;
    /** Opens New task; offered beside Finish step at a step that produces Tasks. */
    readonly onNewTask?: () => void;
    readonly waitingContent?: ReactNode;
    readonly titleNote?: ReactNode;
  };
}

/** A new draft; the only result of a step is chosen already (there is nothing to choose). */
const emptyDraft = (
  attemptKey: string,
  transitions: readonly { readonly id: string }[] = [],
): FinishDraft => ({
  attemptKey,
  ...(transitions.length === 1 ? { transitionId: transitions[0]!.id } : {}),
  feedback: '',
  artifacts: [],
  droppedDrafts: [],
});

function previewOf(position: WorkflowActionProjection['position']): PinPreview | undefined {
  return position.kind === 'not-started' || position.kind === 'blocked'
    ? position.preview
    : undefined;
}

/**
 * The Now block with its workflow actions: Start (a Task's first start confirms its binding), Finish
 * step and Return to an earlier step, each from the projection. Only the main action is a button
 * (an unmet gate's fix when every result needs it, with Finish step beside it); Return, an
 * unavailable Finish step, Workflow history and the step id and revision are in the ⋯ menu. The
 * finish draft lives here, so a gate action can close the Finish dialog and the owner can come back
 * to it unchanged.
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
  gateDocument,
  summary,
  onOpenHistory,
  specification,
}: WorkflowNowProps) {
  const { t } = useTranslation();
  const commands = useWorkflowCommands(subject);
  const { actions, position } = projection;
  const finish = actions.finish;
  const attemptKey = finish ? attemptKeyOf(finish) : '';
  const [dialog, setDialog] = useState<'start' | 'finish' | 'return'>();
  // The attempt the Finish dialog was opened for. When the projection moves on (the finish was
  // recorded although its answer was lost, or someone else finished it), the dialog closes and
  // never offers a retry for an attempt nobody worked on.
  const [finishFor, setFinishFor] = useState<string>();
  const finishOpen = dialog === 'finish' && finishFor === attemptKey;
  // Not after this dialog's own finish succeeded: the refresh may land before the dialog closes.
  const finishMovedOn =
    dialog === 'finish' && finishFor !== attemptKey && !commands.finish.isSuccess;
  const [storedDraft, setDraft] = useState<FinishDraft>();
  // A draft of another attempt (the run moved on) is not this attempt's draft.
  const draft =
    storedDraft?.attemptKey === attemptKey
      ? storedDraft
      : emptyDraft(attemptKey, finish?.transitions);
  const [kept, setKept] = useState(false);
  const [confirmed, setConfirmed] = useState<PinPreview>();
  const [commitNote, setCommitNote] = useState<FinishCommitNote>();
  // The commit result belongs to the finish that ran it: shown for that subject until its next
  // attempt is active, never carried into another step or another subject's Now.
  const shownCommitNote =
    commitNote?.subjectKey === subjectKeyOf(subject) && finish === undefined
      ? commitNote
      : undefined;
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
    setFinishFor(attemptKey);
    setDialog('finish');
  };

  const submitFinish = () => {
    const selected = finish?.transitions.find((transition) => transition.id === draft.transitionId);
    if (!finish || !selected || finishFor !== attemptKey) {
      return;
    }

    const feedback = draft.feedback.trim();
    const finishedSubject = subjectKeyOf(subject);
    commands.finish.mutate(
      {
        step: finish.step,
        attempt: finish.attempt,
        ...(selected.result !== undefined ? { result: selected.result } : {}),
        ...(feedback ? { feedback } : {}),
        ...(draft.artifacts.length > 0 ? { artifacts: [...draft.artifacts] } : {}),
        // A step that produces Tasks keeps the drafts it produced earlier unless the owner unticked
        // them (D06); Tasks created by hand are never part of the list and stay as they are.
        ...(step?.produces === 'tasks'
          ? {
              tasks: (finish.drafts ?? [])
                .filter((proposal) => !draft.droppedDrafts.includes(proposal.id))
                .map((proposal) => ({
                  ...proposal,
                  ...(proposal.dependsOn ? { dependsOn: [...proposal.dependsOn] } : {}),
                })),
            }
          : {}),
      },
      {
        onSuccess: (result) => {
          setDialog(undefined);
          setDraft(undefined);
          setKept(false);
          const postActions = result.postActions ?? [];
          setCommitNote({
            subjectKey: finishedSubject,
            failed: postActions.filter(
              (action): action is FailedPostAction => action.status === 'failed',
            ),
            held: postActions.filter(
              (action): action is HeldPostAction =>
                action.status === 'completed' && action.held !== undefined,
            ),
          });
        },
      },
    );
  };

  const finishGateAction = (gate: GateStatus): GateAction | undefined => {
    const action = gateAction?.(gate);

    return action
      ? {
          label: action.label,
          ...(action.hint !== undefined ? { hint: action.hint } : {}),
          onSelect: () => {
            // The draft stays; Finish step reopens it and the gates are read again.
            setDialog(undefined);
            setKept(true);
            action.onSelect();
          },
        }
      : undefined;
  };

  const openReturn = () => {
    commands.returnTo.reset();
    setDialog('return');
  };

  const startLabel =
    specification && position.kind === 'not-started'
      ? t('workflowExecution.now.startWorkflow')
      : next
        ? t('workflowExecution.now.start', { step: next.step.title || next.step.id })
        : undefined;
  // Finish step is the main action only while some result can be taken now. Otherwise it
  // waits in the menu, unavailable, with why; the main action is the action of an unmet gate, and
  // only of a gate whose result meeting it would make available (`gate-unsatisfied`; open Tasks
  // win over gates in the projection, so meeting the gate of a `tasks-open` result would not help).
  // A `tasks-open` result the dialog closes itself (its own drafts, unticked) can be taken there.
  const finishBlocked =
    finish !== undefined &&
    finish.transitions.length > 0 &&
    finish.transitions.every(
      (transition) => transition.unavailable !== undefined && !closableInFinishDialog(transition),
    );
  const blockedBy = (reason: FinishTransition['unavailable']) =>
    finishBlocked &&
    (finish?.transitions ?? []).some((transition) => transition.unavailable === reason);
  const gateBlocksFinish = blockedBy('gate-unsatisfied');
  const tasksBlockFinish = blockedBy('tasks-open');
  const mainGateAction =
    gateBlocksFinish && finish
      ? finish.transitions
          .filter((transition) => transition.unavailable === 'gate-unsatisfied')
          .flatMap((transition) => transition.gates ?? [])
          .filter((gate) => gate.status === 'unsatisfied')
          .map(finishGateAction)
          .find((action) => action !== undefined)
      : undefined;
  const starting = commands.start.isPending;
  const showStart = actions.start !== undefined && startLabel !== undefined;
  const showFinish = finish !== undefined && !finishBlocked;
  // The actions around the main one, from projection facts (never a step id).
  const plan = nowActionPlan(
    projection,
    primaryAction
      ? 'other'
      : showStart
        ? 'start'
        : showFinish
          ? 'finish'
          : mainGateAction
            ? 'gate'
            : 'none',
    (gate) => gateAction?.(gate) !== undefined,
  );
  const secondary = plan.secondary;
  const onNewTask = specification?.onNewTask;
  // New task beside an unmet gate's action and Finish step: one tap, quieter than a third button.
  const quietNewTask =
    plan.newTask === 'quiet' && onNewTask ? (
      <Button variant="ghost" leadingIcon="plus" onClick={onNewTask}>
        {t('workflowExecution.now.newTask')}
      </Button>
    ) : undefined;
  const secondaryGateStatus = secondary?.kind === 'gate' ? secondary.gate : undefined;
  const secondaryGate = secondaryGateStatus ? finishGateAction(secondaryGateStatus) : undefined;
  const secondaryButton =
    secondary?.kind === 'finish' ? (
      // The main action is the fix; Finish step stays reachable and its dialog says what is missing.
      <Button key="finish" variant="secondary" onClick={openFinish} disabled={busy}>
        {t('workflowExecution.now.finish')}
      </Button>
    ) : secondary?.kind === 'new-task' && onNewTask ? (
      <Button variant="secondary" leadingIcon="plus" onClick={onNewTask}>
        {t('workflowExecution.now.newTask')}
      </Button>
    ) : secondaryGate ? (
      <Button variant="secondary" onClick={secondaryGate.onSelect}>
        {secondaryGate.label}
      </Button>
    ) : undefined;
  const finishIsSecondary = secondary?.kind === 'finish';

  const workflowActions =
    primaryAction ??
    // Distinct keys: the button that opened Finish must never become Start. When a finish whose
    // answer was lost closes its dialog, the dialog returns focus to its opener; a reused element
    // would then be the next step's Start, and one Enter or Space would start a step nobody chose.
    (showStart ? (
      // The busy pattern: the pending label until the new position is read, never a stale one.
      <Button key="start" onClick={startNow} disabled={busy} aria-busy={starting}>
        {starting ? t('workflowExecution.now.starting') : startLabel}
      </Button>
    ) : showFinish ? (
      <>
        <Button key="finish" onClick={openFinish} disabled={busy}>
          {t('workflowExecution.now.finish')}
        </Button>
        {secondaryButton}
      </>
    ) : mainGateAction ? (
      <>
        <Button key="gate" onClick={mainGateAction.onSelect}>
          {mainGateAction.label}
        </Button>
        {secondaryButton}
        {quietNewTask}
      </>
    ) : plan.newTask === 'primary' && onNewTask ? (
      // No main workflow action (Finish step is unavailable): New task is the only action.
      <Button key="new-task" leadingIcon="plus" onClick={onNewTask}>
        {t('workflowExecution.now.newTask')}
      </Button>
    ) : undefined);

  const returnTargets = actions.return?.targets ?? [];
  const technicalStep =
    position.kind === 'active' || position.kind === 'waiting'
      ? position.step.id
      : position.kind === 'ready'
        ? position.next.step.id
        : undefined;
  const menu = (
    <NowOperationsMenu
      operations={[
        ...(actions.return
          ? [
              {
                id: 'return',
                label:
                  returnTargets.length === 1
                    ? t('workflowExecution.now.returnTo', { step: returnTargets[0]!.title })
                    : t('workflowExecution.now.return'),
                onSelect: openReturn,
                disabled: busy,
              },
            ]
          : []),
        ...(finishBlocked && !finishIsSecondary
          ? [
              {
                id: 'finish',
                label: t('workflowExecution.now.finish'),
                onSelect: openFinish,
                disabled: true,
              },
            ]
          : []),
      ]}
      {...(onOpenHistory ? { onOpenHistory } : {})}
      note={[
        ...(gateBlocksFinish && !finishIsSecondary
          ? [t('workflowExecution.now.finishAfterGate')]
          : []),
        ...(tasksBlockFinish ? [t('workflowExecution.now.finishAfterTasks')] : []),
        ...(projection.workflow
          ? [
              t(
                technicalStep
                  ? 'workflowExecution.now.technicalStep'
                  : 'workflowExecution.now.technical',
                {
                  step: technicalStep,
                  title: projection.workflow.title,
                  version: projection.workflow.version,
                },
              ),
            ]
          : []),
      ]}
    />
  );

  // The Overview's Return also opens from Requires attention (a "return to an earlier step" item).
  const canReturn = actions.return !== undefined;
  const resetReturn = commands.returnTo.reset;
  const overviewSpecId = specification?.specId;
  useEffect(() => {
    if (!overviewSpecId) {
      return undefined;
    }

    return subscribeTaskAttention(overviewSpecId, (request) => {
      if (request.kind !== 'return-to-step' || !canReturn) {
        return false;
      }

      resetReturn();
      setDialog('return');

      return true;
    });
  }, [overviewSpecId, canReturn, resetReturn]);

  const note = (
    <>
      {mainGateAction ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {mainGateAction.hint ?? t('workflowExecution.now.finishAfterGate')}
        </Typography>
      ) : null}
      {finishMovedOn ? (
        <InlineNote tone="info" role="status">
          {t('workflowExecution.now.alreadyFinished')}
        </InlineNote>
      ) : null}
      {kept && finish && draft.transitionId ? (
        <InlineNote tone="info">{t('workflowExecution.now.finishKept')}</InlineNote>
      ) : null}
      {shownCommitNote?.failed.map((action) => (
        <InlineNote key={action.action} tone="attention">
          {t('workflowExecution.now.postActionFailed', { code: action.code })}
        </InlineNote>
      ))}
      {shownCommitNote?.held.map((action) => (
        <InlineNote key={action.action} tone="attention">
          {t('workflowExecution.now.postActionHeld', { edited: action.held.edited.join(', ') })}
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
        // A gate's action is not repeated in the list when it is a button of the action row.
        gateActionFor={
          gateAction && !mainGateAction
            ? (gate) => (gate === secondaryGateStatus ? undefined : finishGateAction(gate))
            : undefined
        }
        {...(gateDocument ? { gateDocument } : {})}
        note={note}
        actions={workflowActions}
        starting={starting}
        menu={menu}
        summary={summary}
        {...(specification
          ? {
              showHandoff: false,
              waitingContent: specification.waitingContent,
              titleNote: specification.titleNote,
            }
          : {})}
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
          open={finishOpen}
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
          {...(gateDocument ? { gateDocument } : {})}
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
