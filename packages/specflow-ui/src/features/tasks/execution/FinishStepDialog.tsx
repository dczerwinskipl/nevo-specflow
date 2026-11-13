import { useId, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  RadioGroupOption,
  TextArea,
  Typography,
} from '@nevo/ui';
import type { GateStatus, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { GateList, type GateAction } from './GateList';
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
}

export interface ArtifactOption {
  readonly value: string;
  readonly label: string;
}

export const attemptKeyOf = (finish: Pick<Finish, 'step' | 'attempt'>) =>
  `${finish.step}#${finish.attempt}`;

export function transitionResult(transition: FinishTransition) {
  return transition.label ?? transition.result ?? transition.id;
}

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
  /** The step produces Tasks: a manual finish keeps every Task the owner created. */
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
  producesTasks,
  pending,
  error,
  onSubmit,
}: FinishStepDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const resultLabelId = useId();
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const selected = finish.transitions.find((transition) => transition.id === draft.transitionId);
  const feedbackRequired = selected?.feedback === 'required';
  const feedbackMissing = feedbackRequired && draft.feedback.trim() === '';
  const gates = selected?.gates ?? [];
  const gatesUnmet = gates.some((gate) => gate.status === 'unsatisfied');
  const unavailable = selected?.unavailable === 'task-document-change';
  const blocked = !selected || feedbackMissing || gatesUnmet || unavailable;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                    label={transitionResult(transition)}
                    description={description(transition)}
                  />
                ))}
              </RadioGroup>
            </div>
            {selected && gates.length > 0 ? (
              <div className="grid gap-2" aria-live="polite">
                <Typography as="p" variant="label-sm">
                  {t('workflowExecution.finish.gatesFor', { result: transitionResult(selected) })}
                </Typography>
                <GateList
                  gates={gates}
                  label={t('workflowExecution.finish.gatesFor', {
                    result: transitionResult(selected),
                  })}
                  actionFor={gateActionFor}
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
            {unavailable ? (
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
                      <span className="min-w-0 flex-1 truncate">{labelOf(artifact)}</span>
                      <IconButton
                        icon="close"
                        size="sm"
                        variant="ghost"
                        aria-label={t('workflowExecution.finish.removeArtifact', {
                          name: labelOf(artifact),
                        })}
                        onClick={() =>
                          onDraftChange({
                            ...draft,
                            artifacts: draft.artifacts.filter((value) => value !== artifact),
                          })
                        }
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
                <div>
                  <Menu modal={false}>
                    <MenuTrigger asChild>
                      <Button variant="secondary" size="sm">
                        {t('workflowExecution.finish.attach')}
                      </Button>
                    </MenuTrigger>
                    <MenuContent align="start">
                      {remaining.map((option) => (
                        <MenuItem
                          key={option.value}
                          leadingIcon="file"
                          onSelect={() =>
                            onDraftChange({
                              ...draft,
                              artifacts: [...draft.artifacts, option.value],
                            })
                          }
                        >
                          {option.label}
                        </MenuItem>
                      ))}
                    </MenuContent>
                  </Menu>
                </div>
              ) : null}
            </div>
            {producesTasks ? (
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {t('workflowExecution.finish.keepsTasks')}
              </Typography>
            ) : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={blocked || pending}>
            {pending
              ? t('workflowExecution.finish.finishing')
              : t('workflowExecution.finish.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
