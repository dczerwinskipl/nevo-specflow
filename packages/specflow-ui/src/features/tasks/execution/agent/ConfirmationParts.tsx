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
  Icon,
  InlineNote,
  TextArea,
  Typography,
} from '@nevo/ui';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { focusInitial } from '../focusInitial';
import { InlineAction } from '../InlineAction';
import { transitionLabel } from '../presentation';
import type { NowLinks } from '../StartBlockerLines';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';

type Confirmation = Extract<
  WorkflowActionProjection['position'],
  { kind: 'awaiting-confirmation' }
>;

/** The result the agent proposes, as a person reads it: its label, else the result, else its id. */
export const proposedResult = (proposal: Confirmation['proposal']) =>
  transitionLabel(proposal.transition);

/**
 * The agent's proposal as a labelled quote (the hand-off's look): the result it proposes with the
 * agent that proposes it, then its feedback.
 */
export function ProposalQuote({
  proposal,
  agent,
}: {
  readonly proposal: Confirmation['proposal'];
  readonly agent: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="grid gap-1 border-border-default @min-[40rem]/app-content:border-l-2 @min-[40rem]/app-content:pl-3"
      data-now-proposal=""
    >
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {t('workflowExecution.confirmation.proposes')}{' '}
        <span className="font-medium text-content-primary">
          <span className="mr-1 inline-flex h-[1lh] items-center align-top">
            <Icon name="arrow-right" size="sm" aria-hidden="true" />
          </span>
          {proposedResult(proposal)}
        </span>
        {agent ? ` · ${agent}` : null}
      </Typography>
      {proposal.feedback ? (
        <Typography
          as="p"
          variant="body-sm"
          className="whitespace-pre-line text-content-primary [overflow-wrap:anywhere]"
        >
          {proposal.feedback}
        </Typography>
      ) : null}
    </div>
  );
}

/** What Confirm applies, in the owner's words: the drafts it approves and where the run goes. */
export function ConfirmApplies({
  confirmation,
  links,
}: {
  readonly confirmation: Confirmation;
  readonly links: NowLinks;
}) {
  const { t, i18n } = useTranslation();
  const { proposal, confirms } = confirmation;
  const drafts = confirms.approvesDrafts ?? [];
  const decisions = confirms.taskDecisions ?? [];
  const { target, targetTitle } = proposal.transition;
  const goesTo =
    target.kind === 'step'
      ? t('workflowExecution.confirmation.movesTo', { step: targetTitle ?? target.step })
      : t(`workflowExecution.confirmation.ends.${target.outcome}`);
  const parts = [
    drafts.length > 0
      ? t('workflowExecution.confirmation.approvesDrafts', {
          count: drafts.length,
          first: drafts[0],
          last: drafts.at(-1),
        })
      : undefined,
    decisions.length > 0
      ? t('workflowExecution.confirmation.recordsDecisions', { count: decisions.length })
      : undefined,
    goesTo,
  ].filter((part): part is string => part !== undefined);

  return (
    <InlineNote tone="info" data-now-confirm-applies="">
      {t('workflowExecution.confirmation.applies', {
        what: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(parts),
      })}
      {links.tasks && (drafts.length > 0 || decisions.length > 0) ? (
        <>
          {' '}
          <InlineAction className="ml-1" onClick={links.tasks}>
            {t('workflowExecution.now.seeTasks')}
          </InlineAction>
        </>
      ) : null}
    </InlineNote>
  );
}

export interface RejectResultDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stepTitle: string;
  readonly result: string;
  /** The drafts the agent wrote stay: said only when there are some. */
  readonly keepsDrafts: boolean;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (feedback: string) => void;
}

/**
 * Reject the agent's result: the step goes back to ready to start with the owner's feedback as its
 * hand-off. The feedback is required, so the next attempt knows what to change.
 */
export function RejectResultDialog(props: RejectResultDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t('common.close')} onOpenAutoFocus={focusInitial}>
        {/* Mounted only while open: every opening starts with an empty field. */}
        {props.open ? <RejectForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RejectForm({
  onOpenChange,
  stepTitle,
  result,
  keepsDrafts,
  pending,
  error,
  onSubmit,
}: RejectResultDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [feedback, setFeedback] = useState('');
  const blocked = feedback.trim() === '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!blocked && !pending) {
      onSubmit(feedback.trim());
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('workflowExecution.confirmation.rejectTitle')}</DialogTitle>
        <DialogDescription>
          {t(
            keepsDrafts
              ? 'workflowExecution.confirmation.rejectDescriptionDrafts'
              : 'workflowExecution.confirmation.rejectDescription',
            { step: stepTitle, result },
          )}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={formId} noValidate onSubmit={submit} className="grid gap-6">
          {error ? <WorkflowRefusalAlert error={error} /> : null}
          <Field>
            <Field.Label>{t('workflowExecution.confirmation.feedbackLabel')}</Field.Label>
            <TextArea
              rows={4}
              value={feedback}
              aria-required
              onChange={(event) => setFeedback(event.target.value)}
            />
            <Field.Description>
              {t('workflowExecution.confirmation.feedbackHint')}
            </Field.Description>
          </Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <Button data-initial-focus="" variant="secondary" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" form={formId} disabled={blocked || pending} aria-busy={pending}>
          {t('workflowExecution.confirmation.reject')}
        </Button>
      </DialogFooter>
    </>
  );
}
