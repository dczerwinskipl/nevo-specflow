import { useTranslation } from 'react-i18next';
import { Icon, InformationList, Typography, type IconName } from '@nevo/ui';
import { OperationalRow } from '../../../../shared/operational-list';
import { HandoffFeedback, type HandoffFeedbackTone } from './HandoffFeedback';

/**
 * How the hand-off reads: `done` (the step finished as expected: its feedback waits behind "Show
 * feedback"), `blocking` (a review requested changes, a return, an agent's error: the feedback is
 * open and in the attention tone) or `waiting` (the agent's result waits for the owner: open, in
 * the info tone).
 */
export type HandoffTone = 'done' | 'blocking' | 'waiting';

const FEEDBACK_TONES: Record<HandoffTone, HandoffFeedbackTone> = {
  done: 'neutral',
  blocking: 'attention',
  waiting: 'info',
};

const ICONS: Record<HandoffTone, { readonly name: IconName; readonly className: string }> = {
  done: { name: 'circle-check', className: 'text-status-success' },
  blocking: { name: 'circle-alert', className: 'text-status-attention' },
  waiting: { name: 'clock', className: 'text-status-info' },
};

/**
 * The last hand-off of a workflow (or the agent's result waiting for the owner): its outcome as the
 * row's title, who handed it over and when, what was committed, then its feedback
 * ({@link HandoffFeedback}: a preview of a few lines, the whole of it in the work history). The row
 * opens the details (the work history) when `onOpenDetails` is given. A finished step's feedback is
 * collapsed; feedback the next attempt or the owner must act on is open and emphasised. Shared by
 * the Specification's and a Task's Now.
 */
export function LastHandoff({
  heading,
  outcome,
  meta,
  commit,
  feedback,
  tone,
  onOpenDetails,
  onOpenFeedback,
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
  /** Opens the detail view holding the whole feedback; absent: no detail view holds it. */
  readonly onOpenFeedback?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const icon = ICONS[tone];

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
      {feedback ? (
        <HandoffFeedback
          feedback={feedback}
          mode="summary"
          tone={FEEDBACK_TONES[tone]}
          initiallyOpen={tone !== 'done'}
          onOpenFull={onOpenFeedback}
          showLabel={t('workflowExecution.feedback.show')}
        />
      ) : null}
    </section>
  );
}
