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
  /** Names the document that meets a gate (`findings.md`). */
  readonly gateDocument?: (gate: GateStatus) => string | undefined;
  /**
   * The Specification Overview's layout: only the main action is a button (an unmet gate's action
   * when every result needs it); Return, an unavailable Finish step, Workflow history and the step
   * id and revision are in the ⋯ menu. A Requires attention "return" opens the same Return dialog.
   */
  readonly overview?: {
    readonly specId: string;
    readonly onOpenHistory?: () => void;
    readonly waitingContent?: ReactNode;
    readonly titleNote?: ReactNode;
    readonly summary?: ReactNode;
  };
}

const emptyDraft = (attemptKey: string): FinishDraft => ({
  attemptKey,
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
  gateDocument,
  overview,
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
    setFinishFor(attemptKey);
    setDialog('finish');
  };

  const submitFinish = () => {
    const selected = finish?.transitions.find((transition) => transition.id === draft.transitionId);
    if (!finish || !selected || finishFor !== attemptKey) {
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

  const openReturn = () => {
    commands.returnTo.reset();
    setDialog('return');
  };

  const startLabel =
    overview && position.kind === 'not-started'
      ? t('workflowExecution.now.startWorkflow')
      : next
        ? t('workflowExecution.now.start', { step: next.step.title || next.step.id })
        : undefined;
  // Overview: when every result of the active step needs an unmet gate, the gate's action is the
  // main action and Finish step waits in the menu, unavailable.
  const gateBlocksFinish =
    overview !== undefined &&
    finish !== undefined &&
    finish.transitions.length > 0 &&
    finish.transitions.every((transition) =>
      (transition.gates ?? []).some((gate) => gate.status === 'unsatisfied'),
    );
  const mainGateAction = gateBlocksFinish
    ? finish.transitions
        .flatMap((transition) => transition.gates ?? [])
        .filter((gate) => gate.status === 'unsatisfied')
        .map(finishGateAction)
        .find((action) => action !== undefined)
    : undefined;

  const workflowActions =
    primaryAction ??
    (overview ? (
      actions.start && startLabel ? (
        <Button onClick={startNow} disabled={busy}>
          {startLabel}
        </Button>
      ) : finish && !gateBlocksFinish ? (
        <Button onClick={openFinish} disabled={busy}>
          {t('workflowExecution.now.finish')}
        </Button>
      ) : mainGateAction ? (
        <>
          <Button onClick={mainGateAction.onSelect}>{mainGateAction.label}</Button>
          <Typography as="p" variant="body-sm" className="self-center text-content-secondary">
            {t('workflowExecution.now.finishAfterGate')}
          </Typography>
        </>
      ) : undefined
    ) : actions.start || finish || actions.return ? (
      <>
        {actions.start && startLabel ? (
          <Button onClick={startNow} disabled={busy}>
            {startLabel}
          </Button>
        ) : null}
        {finish ? (
          <Button onClick={openFinish} disabled={busy}>
            {t('workflowExecution.now.finish')}
          </Button>
        ) : null}
        {actions.return ? (
          <Button variant="secondary" disabled={busy} onClick={openReturn}>
            {t('workflowExecution.now.return')}
          </Button>
        ) : null}
      </>
    ) : undefined);

  const returnTargets = actions.return?.targets ?? [];
  const technicalStep =
    position.kind === 'active' || position.kind === 'waiting'
      ? position.step.id
      : position.kind === 'ready'
        ? position.next.step.id
        : undefined;
  const menu = overview ? (
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
        ...(gateBlocksFinish
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
      {...(overview.onOpenHistory ? { onOpenHistory: overview.onOpenHistory } : {})}
      note={[
        ...(gateBlocksFinish ? [t('workflowExecution.now.finishAfterGate')] : []),
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
  ) : undefined;

  // The Overview's Return also opens from Requires attention (a "return to an earlier step" item).
  const canReturn = actions.return !== undefined;
  const resetReturn = commands.returnTo.reset;
  const overviewSpecId = overview?.specId;
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
      {finishMovedOn ? (
        <InlineNote tone="info" role="status">
          {t('workflowExecution.now.alreadyFinished')}
        </InlineNote>
      ) : null}
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
        // The gate's action is not repeated in the list when it is the main action.
        gateActionFor={gateAction && !mainGateAction ? finishGateAction : undefined}
        {...(gateDocument ? { gateDocument } : {})}
        note={note}
        actions={workflowActions}
        menu={menu}
        {...(overview
          ? {
              compactDetail: true,
              showHandoff: false,
              waitingContent: overview.waitingContent,
              titleNote: overview.titleNote,
              summary: overview.summary,
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
