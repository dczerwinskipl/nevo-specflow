import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, InformationList, InlineNote, Typography, cn, type IconName } from '@nevo/ui';
import { OperationalRow } from '../../../../shared/operational-list';
import { InlineAction } from '../InlineAction';

/** Feedback longer than this (or of more than one paragraph) opens with its first paragraph. */
const FEEDBACK_SUMMARY_CHARS = 320;

/**
 * How the hand-off reads: `done` (the step finished as expected: its feedback waits behind "Show
 * feedback"), `blocking` (a review requested changes, a return, an agent's error: the feedback is
 * open and in the attention tone) or `waiting` (the agent's result waits for the owner: open, in
 * the info tone).
 */
export type HandoffTone = 'done' | 'blocking' | 'waiting';

const ICONS: Record<HandoffTone, { readonly name: IconName; readonly className: string }> = {
  done: { name: 'circle-check', className: 'text-status-success' },
  blocking: { name: 'circle-alert', className: 'text-status-attention' },
  waiting: { name: 'clock', className: 'text-status-info' },
};

/** Feedback: its first paragraph, the rest behind "Show the full feedback". */
function Feedback({ feedback }: { readonly feedback: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const text = feedback.trim();
  const first = text.split(/\n\s*\n/)[0] ?? text;
  const summary =
    first.length > FEEDBACK_SUMMARY_CHARS
      ? `${first.slice(0, FEEDBACK_SUMMARY_CHARS).trimEnd()}…`
      : first;
  const long = summary !== text;

  return (
    <div className="grid justify-items-start gap-1" data-now-feedback="">
      <span className="whitespace-pre-line text-content-primary [overflow-wrap:anywhere]">
        {open || !long ? text : summary}
      </span>
      {long ? (
        <InlineAction onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? t('workflowExecution.now.feedbackLess') : t('workflowExecution.now.feedbackAll')}
        </InlineAction>
      ) : null}
    </div>
  );
}

/**
 * The last hand-off of a workflow (or the agent's result waiting for the owner): its outcome as the
 * row's title, who handed it over and when, what was committed, then its feedback. The row opens
 * the details (the work history) when `onOpenDetails` is given. A finished step's feedback is
 * collapsed; feedback the next attempt or the owner must act on is open and emphasised. Shared by
 * the Specification's and a Task's Now and the Specifications list.
 */
export function LastHandoff({
  heading,
  outcome,
  meta,
  commit,
  feedback,
  tone,
  onOpenDetails,
}: {
  /** The block's label: "Last hand-off", "The agent's result". */
  readonly heading: string;
  /** What the hand-off decided: "Breakdown approved", "Changes requested", "Returned to this step". */
  readonly outcome: string;
  /** Who handed it over and when: "Claude · Opus 5.5 · Today, 1:12 AM". */
  readonly meta?: string;
  /** What was committed: "4 documents committed · 05f9d80". */
  readonly commit?: string;
  readonly feedback?: string;
  readonly tone: HandoffTone;
  readonly onOpenDetails?: () => void;
}) {
  const { t } = useTranslation();
  const [showFeedback, setShowFeedback] = useState(false);
  const icon = ICONS[tone];
  const text = feedback?.trim() ?? '';
  const openFeedback = tone !== 'done';

  return (
    <section
      // A divider, not a card: the hand-off is what came before; Now above it is what happens now.
      className="grid min-w-0 gap-1.5 border-t border-divider pt-3"
      data-now-handoff=""
      data-handoff-tone={tone}
    >
      <Typography as="h3" variant="label-sm" className="text-content-secondary">
        {heading}
      </Typography>
      {/* The hand-off is one object: the same row as the Sessions and Documentation entries. */}
      <InformationList aria-label={heading} className="-mx-2">
        <OperationalRow
          primary={outcome}
          titleAs="span"
          leading={
            <Icon name={icon.name} size="sm" aria-hidden="true" className={icon.className} />
          }
          {...(meta ? { supporting: meta } : {})}
          {...(onOpenDetails
            ? {
                onPrimaryClick: onOpenDetails,
                primaryAriaLabel: t('workflowExecution.now.handoffDetails', { outcome }),
                trailing: <Icon name="chevron-right" size="sm" className="text-content-muted" />,
              }
            : { interactive: false })}
        />
      </InformationList>
      {commit ? (
        <Typography
          as="p"
          variant="body-sm"
          className="text-content-secondary [overflow-wrap:anywhere]"
          data-now-handoff-commit=""
        >
          {commit}
        </Typography>
      ) : null}
      {text === '' ? null : openFeedback ? (
        <InlineNote
          tone={tone === 'blocking' ? 'attention' : 'info'}
          icon={tone === 'blocking' ? 'circle-alert' : 'chat'}
        >
          <Feedback feedback={text} />
        </InlineNote>
      ) : (
        <div className={cn('grid justify-items-start gap-1 text-body-sm')}>
          <InlineAction
            onClick={() => setShowFeedback((value) => !value)}
            aria-expanded={showFeedback}
          >
            {showFeedback
              ? t('workflowExecution.now.feedbackHide')
              : t('workflowExecution.now.feedbackShow')}
          </InlineAction>
          {showFeedback ? <Feedback feedback={text} /> : null}
        </div>
      )}
    </section>
  );
}
