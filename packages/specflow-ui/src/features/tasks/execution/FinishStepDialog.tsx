import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CheckboxField,
  Combobox,
  ComboboxItem,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  IconButton,
  InlineNote,
  RadioGroup,
  RadioGroupOption,
  TextArea,
  Typography,
} from '@nevo/ui';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import {
  closableInFinishDialog,
  FinishTasksOpenNote,
  stillOpenAfterFinish,
} from './FinishTasksOpen';
import { GateList, type GateAction } from './GateList';
import { transitionLabel } from './presentation';
import { workflowRefusalOf } from './refusal';
import { WorkflowRefusalAlert } from './WorkflowRefusalAlert';

type Finish = NonNullable<WorkflowActionProjection['actions']['finish']>;
export type FinishTransition = Finish['transitions'][number];

/** What the owner has chosen and typed; it outlives the dialog (a gate action closes it). */
export interface FinishDraft {
  /** The attempt the draft belongs to (`step#attempt`); a draft of another attempt is ignored. */
  readonly attemptKey: string;
  readonly transitionId?: string;
  readonly feedback: string;
  readonly artifacts: readonly string[];
  /** Drafts this step produced earlier that the owner unticked: the finish cancels them. */
  readonly droppedDrafts: readonly string[];
}

export interface ArtifactOption {
  readonly value: string;
  readonly label: string;
}

export const attemptKeyOf = (finish: Pick<Finish, 'step' | 'attempt'>) =>
  `${finish.step}#${finish.attempt}`;

export interface FinishStepDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stepTitle: string;
  readonly finish: Finish;
  readonly draft: FinishDraft;
  readonly onDraftChange: (draft: FinishDraft) => void;
  /** Reopened after a gate action: the gates were read again, the draft is as it was left. */
  readonly rechecked: boolean;
  readonly artifactOptions: readonly ArtifactOption[];
  readonly gateActionFor?: (gate: GateStatus) => GateAction | undefined;
  readonly gateDocument?: (gate: GateStatus) => string | undefined;
  /** The step produces Tasks: its own earlier drafts are listed; Tasks made by hand stay. */
  readonly producesTasks: boolean;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: () => void;
}

/**
 * Finish the active attempt: one result of the projection's transitions, feedback (required when
 * the result demands it), optional artifacts and the exit gates of the chosen result. Finish stays
 * disabled while a gate of that result is unmet; other results stay available. A submit in
 * progress cannot be repeated; after a lost answer the same finish may be sent again (the Engine
 * returns the recorded result).
 */
export function FinishStepDialog({
  open,
  onOpenChange,
  stepTitle,
  finish,
  draft,
  onDraftChange,
  rechecked,
  artifactOptions,
  gateActionFor,
  gateDocument,
  producesTasks,
  pending,
  error,
  onSubmit,
}: FinishStepDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const resultLabelId = useId();
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const [artifactQuery, setArtifactQuery] = useState('');
  const focusAttached = useRef<string | undefined>(undefined);
  const focusArtifactPicker = useRef(false);
  const selected = finish.transitions.find((transition) => transition.id === draft.transitionId);
  const feedbackRequired = selected?.feedback === 'required';
  const feedbackMissing = feedbackRequired && draft.feedback.trim() === '';
  const gates = selected?.gates ?? [];
  const gatesUnmet = gates.some((gate) => gate.status === 'unsatisfied');
  // The Engine says whether the result can be taken now; the gates are shown, not re-evaluated. A
  // result waiting for open Tasks that this finish closes itself (its unticked drafts) is taken
  // once no Task stays open after them and its gates hold (open Tasks win over gates in the
  // projection, so a gate is only checked here); the Engine still decides.
  const unavailable = selected?.unavailable;
  const closedHere =
    selected !== undefined &&
    closableInFinishDialog(selected) &&
    stillOpenAfterFinish(selected, draft.droppedDrafts).length === 0 &&
    !gatesUnmet;
  const blocked = !selected || feedbackMissing || (unavailable !== undefined && !closedHere);
  // Why Finish is disabled, next to it: the detail stays where the form shows it.
  const blockedReason = (() => {
    if (!selected) {
      return t('workflowExecution.finish.blocked.noResult');
    }

    if (feedbackMissing) {
      return t('workflowExecution.finish.blocked.feedback');
    }

    if (gatesUnmet) {
      return t('workflowExecution.finish.blocked.gates');
    }

    if (blocked) {
      return t('workflowExecution.finish.blocked.unavailable');
    }

    return undefined;
  })();
  const blockedReasonId = useId();
  const drafts = finish.drafts ?? [];
  // The Engine names each kept draft that depends on an unticked one; shown while it still holds.
  const conflicts = workflowRefusalOf(error).draftConflicts.filter(
    (conflict) =>
      draft.droppedDrafts.includes(conflict.dependsOnCancelled) &&
      !draft.droppedDrafts.includes(conflict.kept),
  );
  const remaining = artifactOptions.filter((option) => !draft.artifacts.includes(option.value));
  const labelOf = (value: string) =>
    artifactOptions.find((option) => option.value === value)?.label ?? value;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked || pending) {
      return;
    }

    onSubmit();
  };

  const description = (transition: FinishTransition) => {
    const target =
      transition.target.kind === 'terminal'
        ? t('workflowExecution.finish.ends')
        : t('workflowExecution.finish.goesTo', {
            title: transition.targetTitle ?? transition.target.step,
          });

    return transition.feedback === 'required'
      ? `${target} · ${t('workflowExecution.finish.feedbackRequiredShort')}`
      : target;
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setArtifactQuery('');
      focusAttached.current = undefined;
      focusArtifactPicker.current = false;
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        closeLabel={t('common.close')}
        onOpenAutoFocus={(event) => {
          // Reopened with a draft: continue where the owner left off.
          if (draft.transitionId && feedbackRef.current) {
            event.preventDefault();
            feedbackRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('workflowExecution.finish.title', { step: stepTitle })}</DialogTitle>
          <DialogDescription>
            {t('workflowExecution.finish.description', { attempt: finish.attempt })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
            {error ? <WorkflowRefusalAlert error={error} retrySafe /> : null}
            <div className="grid gap-2">
              <Typography as="p" variant="label-sm" id={resultLabelId}>
                {t('workflowExecution.finish.result')}
              </Typography>
              <RadioGroup
                value={draft.transitionId ?? ''}
                onValueChange={(transitionId) => onDraftChange({ ...draft, transitionId })}
                aria-labelledby={resultLabelId}
              >
                {finish.transitions.map((transition) => (
                  <RadioGroupOption
                    key={transition.id}
                    value={transition.id}
                    label={transitionLabel(transition)}
                    description={description(transition)}
                  />
                ))}
              </RadioGroup>
            </div>
            {selected && gates.length > 0 ? (
              <div className="grid gap-2" aria-live="polite">
                <Typography as="p" variant="label-sm">
                  {t('workflowExecution.finish.gatesFor', { result: transitionLabel(selected) })}
                </Typography>
                <GateList
                  gates={gates}
                  label={t('workflowExecution.finish.gatesFor', {
                    result: transitionLabel(selected),
                  })}
                  actionFor={gateActionFor}
                  {...(gateDocument ? { documentFor: gateDocument } : {})}
                />
                {gatesUnmet ? (
                  <Typography as="p" variant="body-sm" className="text-content-secondary">
                    {t('workflowExecution.finish.gatesUnmet')}
                  </Typography>
                ) : rechecked ? (
                  <Typography as="p" variant="body-sm" className="text-content-secondary">
                    {t('workflowExecution.finish.rechecked')}
                  </Typography>
                ) : null}
              </div>
            ) : null}
            {unavailable === 'tasks-open' && selected ? (
              <FinishTasksOpenNote transition={selected} droppedDrafts={draft.droppedDrafts} />
            ) : null}
            {unavailable === 'task-document-change' ? (
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {t('workflowExecution.finish.documentChangePending')}
              </Typography>
            ) : null}
            <Field invalid={feedbackMissing}>
              <Field.Label>
                {feedbackRequired
                  ? t('workflowExecution.finish.feedbackRequired')
                  : t('workflowExecution.finish.feedbackOptional')}
              </Field.Label>
              <TextArea
                ref={feedbackRef}
                rows={4}
                value={draft.feedback}
                onChange={(event) => onDraftChange({ ...draft, feedback: event.target.value })}
                aria-required={feedbackRequired || undefined}
              />
              {feedbackMissing ? (
                <Field.Error role="alert">
                  {t('workflowExecution.finish.feedbackNeeded')}
                </Field.Error>
              ) : (
                <Field.Description>{t('workflowExecution.finish.feedbackHint')}</Field.Description>
              )}
            </Field>
            <div className="grid gap-2">
              <Typography as="p" variant="label-sm">
                {t('workflowExecution.finish.artifacts')}
              </Typography>
              {draft.artifacts.length > 0 ? (
                <ul className="grid gap-1" aria-label={t('workflowExecution.finish.attached')}>
                  {draft.artifacts.map((artifact) => (
                    <li key={artifact} className="flex min-w-0 items-center gap-2 text-body-sm">
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="break-words">{labelOf(artifact)}</span>
                        {labelOf(artifact) !== artifact ? (
                          <span className="break-all text-content-muted">{artifact}</span>
                        ) : null}
                      </span>
                      <IconButton
                        ref={(node) => {
                          if (node && focusAttached.current === artifact) {
                            focusAttached.current = undefined;
                            node.focus();
                          }
                        }}
                        icon="close"
                        size="sm"
                        variant="ghost"
                        aria-label={t('workflowExecution.finish.removeArtifact', {
                          name:
                            labelOf(artifact) === artifact
                              ? artifact
                              : `${labelOf(artifact)} (${artifact})`,
                        })}
                        onClick={() => {
                          focusArtifactPicker.current = true;
                          onDraftChange({
                            ...draft,
                            artifacts: draft.artifacts.filter((value) => value !== artifact),
                          });
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <Typography as="p" variant="body-sm" className="text-content-muted">
                  {t('workflowExecution.finish.artifactsHint')}
                </Typography>
              )}
              {remaining.length > 0 ? (
                <Combobox
                  inputRef={(node) => {
                    if (node && focusArtifactPicker.current) {
                      focusArtifactPicker.current = false;
                      node.focus();
                    }
                  }}
                  value={null}
                  inputValue={artifactQuery}
                  onInputChange={setArtifactQuery}
                  aria-label={t('workflowExecution.finish.attach')}
                  placeholder={t('workflowExecution.finish.findArtifact')}
                  labels={{
                    showOptions: t('common.options.show'),
                    noResults: t('common.options.noResults'),
                    loading: t('common.options.loading'),
                  }}
                  onValueChange={(value) => {
                    // Both selection and Escape commit the controlled lookup text.
                    setArtifactQuery('');
                    if (value === null) {
                      return;
                    }

                    if (remaining.length === 1) {
                      focusAttached.current = value;
                    }

                    onDraftChange({ ...draft, artifacts: [...draft.artifacts, value] });
                  }}
                >
                  {remaining.map((option) => (
                    <ComboboxItem
                      key={option.value}
                      value={option.value}
                      textValue={`${option.label} ${option.value}`}
                      description={option.label !== option.value ? option.value : undefined}
                    >
                      {option.label}
                    </ComboboxItem>
                  ))}
                </Combobox>
              ) : null}
            </div>
            {producesTasks && drafts.length > 0 ? (
              <fieldset className="grid gap-2">
                <legend className="text-label-sm font-medium text-content-primary">
                  {t('workflowExecution.finish.drafts')}
                </legend>
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  {t('workflowExecution.finish.draftsHint')}
                </Typography>
                {drafts.map((proposal) => {
                  const neededBy = conflicts
                    .filter((conflict) => conflict.dependsOnCancelled === proposal.id)
                    .map((conflict) => conflict.kept);

                  return (
                    <div key={proposal.id} className="grid gap-1">
                      <CheckboxField
                        label={`${proposal.id} · ${proposal.title}`}
                        checked={!draft.droppedDrafts.includes(proposal.id)}
                        onCheckedChange={(checked) =>
                          onDraftChange({
                            ...draft,
                            droppedDrafts:
                              checked === true
                                ? draft.droppedDrafts.filter((id) => id !== proposal.id)
                                : [...draft.droppedDrafts, proposal.id],
                          })
                        }
                      />
                      {neededBy.length > 0 ? (
                        <InlineNote tone="danger">
                          {t('workflowExecution.finish.draftNeeded', {
                            draft: proposal.id,
                            kept: neededBy.join(', '),
                          })}
                        </InlineNote>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
            ) : producesTasks ? (
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {t('workflowExecution.finish.keepsTasks')}
              </Typography>
            ) : null}
          </form>
        </DialogBody>
        <DialogFooter>
          {blockedReason && !pending ? (
            <InlineNote id={blockedReasonId} className="mr-auto min-w-0">
              {blockedReason}
            </InlineNote>
          ) : null}
          <Button variant="secondary" onClick={() => changeOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={blocked || pending}
            aria-describedby={blockedReason && !pending ? blockedReasonId : undefined}
          >
            {pending
              ? t('workflowExecution.finish.finishing')
              : t('workflowExecution.finish.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
