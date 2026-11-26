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
  TextArea,
} from '@nevo/ui';
import { AGENT_OWNER_NOTE_MAX_LENGTH } from '@nevo/specflow-contracts/workflow';
import { focusInitial } from '../focusInitial';

export interface ContinueDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stepTitle: string;
  readonly attempt: number;
  /** The work mode the attempt's Session runs in, which the continued Turn inherits. */
  readonly workMode?: string;
  readonly pending: boolean;
  /** Continue the attempt, with the owner's note when they wrote one. */
  readonly onContinue: (note: string | undefined) => void;
}

/**
 * Continue a stopped agent's attempt, with an optional note for the agent. The note goes into the
 * attempt's own Turn after SpecFlow's continuation brief, with the attempt's scope (never a separate
 * chat Turn). Without a note it continues exactly as before; Continue has the initial focus, so an
 * empty note is one more press.
 */
export function ContinueDialog({
  open,
  onOpenChange,
  stepTitle,
  attempt,
  workMode,
  pending,
  onContinue,
}: ContinueDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const tooLong = trimmed.length > AGENT_OWNER_NOTE_MAX_LENGTH;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!tooLong && !pending) {
      onContinue(trimmed === '' ? undefined : trimmed);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setNote('');
        }

        onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={t('common.close')} onOpenAutoFocus={focusInitial}>
        <DialogHeader>
          <DialogTitle>
            {t('workflowExecution.agentAttempt.continueDialog.title', { step: stepTitle })}
          </DialogTitle>
          <DialogDescription>
            {t('workflowExecution.agentAttempt.continueDialog.description', { attempt })}
            {workMode
              ? ' ' + t('workflowExecution.agent.session.workMode', { mode: workMode })
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
            <Field invalid={tooLong}>
              <Field.Label>
                {t('workflowExecution.agentAttempt.continueDialog.noteLabel')}
              </Field.Label>
              <TextArea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
              <Field.Description>
                {tooLong
                  ? t('workflowExecution.agentAttempt.continueDialog.tooLong', {
                      max: AGENT_OWNER_NOTE_MAX_LENGTH,
                    })
                  : t('workflowExecution.agentAttempt.continueDialog.noteHint')}
              </Field.Description>
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            data-initial-focus=""
            type="submit"
            form={formId}
            disabled={tooLong || pending}
            aria-busy={pending}
          >
            {pending
              ? t('workflowExecution.agent.submitting')
              : trimmed === ''
                ? t('workflowExecution.agentAttempt.continue')
                : t('workflowExecution.agentAttempt.continueDialog.withNote')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
