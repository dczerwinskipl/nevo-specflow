import { useId, useState, type FormEvent } from 'react';
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
  RadioGroup,
  RadioGroupOption,
  TextArea,
  Typography,
} from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { focusInitial } from './focusInitial';
import { WorkflowRefusalAlert } from './WorkflowRefusalAlert';

type Target = NonNullable<WorkflowActionProjection['actions']['return']>['targets'][number];

export interface ReturnStepDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The current step's title; absent when no attempt is active (a wait step, a ready step). */
  readonly currentTitle?: string;
  readonly targets: readonly Target[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (input: { readonly step: string; readonly reason: string }) => void;
}

/** Send the run back to one of the earlier steps the projection allows, with its reason. */
export function ReturnStepDialog(props: ReturnStepDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')} onOpenAutoFocus={focusInitial}>
        {/* Mounted only while open: every opening starts from the latest target. */}
        {props.open ? <ReturnForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ReturnForm({
  onOpenChange,
  currentTitle,
  targets,
  pending,
  error,
  onSubmit,
}: ReturnStepDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const labelId = useId();
  const [step, setStep] = useState(targets.at(-1)?.step ?? '');
  const [reason, setReason] = useState('');
  const target = targets.find((candidate) => candidate.step === step);
  const reasonRequired = target?.feedback === 'required';
  const blocked = !target || (reasonRequired && reason.trim() === '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked || pending) {
      return;
    }

    onSubmit({ step, reason: reason.trim() });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('workflowExecution.return.title')}</DialogTitle>
        <DialogDescription>
          {currentTitle
            ? t('workflowExecution.return.descriptionActive', { step: currentTitle })
            : t('workflowExecution.return.description')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
          {error ? <WorkflowRefusalAlert error={error} /> : null}
          <div className="grid gap-2">
            <Typography as="p" variant="label-sm" id={labelId}>
              {t('workflowExecution.return.to')}
            </Typography>
            <RadioGroup value={step} onValueChange={setStep} aria-labelledby={labelId}>
              {targets.map((candidate) => (
                <RadioGroupOption
                  key={candidate.step}
                  value={candidate.step}
                  label={<span title={candidate.step}>{candidate.label ?? candidate.title}</span>}
                />
              ))}
            </RadioGroup>
          </div>
          <Field>
            <Field.Label>
              {reasonRequired
                ? t('workflowExecution.return.reasonRequired')
                : t('workflowExecution.return.reasonOptional')}
            </Field.Label>
            <TextArea
              rows={3}
              value={reason}
              aria-required={reasonRequired || undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            <Field.Description>{t('workflowExecution.return.reasonHint')}</Field.Description>
          </Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button data-initial-focus="" variant="secondary" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" form={formId} disabled={blocked || pending}>
          {t('workflowExecution.return.submit', { step: target?.title ?? '' })}
        </Button>
      </DialogFooter>
    </>
  );
}
