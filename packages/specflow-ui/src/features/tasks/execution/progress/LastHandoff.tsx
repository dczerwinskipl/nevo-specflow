import { Icon, InformationList, Typography, type IconName } from '@nevo/ui';
import { OperationalRow } from '../../../../shared/operational-list';
import { productIcons } from '../../../../shared/product-icons';
import { FeedbackLink } from '../feedback/FeedbackParts';

/**
 * How the hand-off reads: `done` (the step finished as expected), `blocking` (a review requested
 * changes, a return, an agent's error: what the next attempt must act on, in the attention tone) or
 * `waiting` (the agent's result waits for the owner, in the info tone).
 */
export type HandoffTone = 'done' | 'blocking' | 'waiting';

const ICONS: Record<HandoffTone, { readonly name: IconName; readonly className: string }> = {
  done: { name: 'circle-check', className: 'text-status-success' },
  blocking: { name: 'circle-alert', className: 'text-status-attention' },
  waiting: { name: 'clock', className: 'text-status-info' },
};

/**
 * The last hand-off of a workflow (or the agent's result waiting for the owner): its outcome as the
 * row's title, then one line each for the step, who handed it over and when, what was committed
 * ("[commit] 3 documents · 3ca401a") and "View feedback ›", which opens the shared Feedback view
 * (workflow-execution.md, "Feedback"). Feedback is never previewed here: one place presents it. The
 * row itself opens nothing (one chevron per block: View feedback's; the history is the header's
 * action). Shared by the Specification's and a Task's Now.
 */
export function LastHandoff({
  heading,
  outcome,
  lines = [],
  commit,
  tone,
  onOpenFeedback,
}: {
  /** The block's label: "Last hand-off", "The agent's result". */
  readonly heading: string;
  /** What the hand-off decided: "Breakdown approved", "Changes requested", "Returned to this step". */
  readonly outcome: string;
  /** The step, who handed it over and when, one line each: ["Review the breakdown", "Claude Code · Opus 5.5", "Nov 25, 5:09 PM"]. */
  readonly lines?: readonly string[];
  /** What was committed: "3 documents · 3ca401a". */
  readonly commit?: string;
  readonly tone: HandoffTone;
  /** Opens the hand-off's feedback in the Feedback view; absent: the hand-off left none. */
  readonly onOpenFeedback?: (() => void) | undefined;
}) {
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
          {...(lines.length > 0
            ? {
                supporting: (
                  <span className="grid" data-now-handoff-lines="">
                    {lines.map((line, index) => (
                      <span key={index}>{line}</span>
                    ))}
                  </span>
                ),
              }
            : {})}
          interactive={false}
        />
      </InformationList>
      {commit ? (
        <Typography
          as="p"
          variant="body-sm"
          className="flex min-w-0 items-start gap-2 text-content-secondary"
          data-now-handoff-commit=""
        >
          <span className="flex h-[1lh] shrink-0 items-center">
            <Icon name={productIcons.commit} size="sm" aria-hidden="true" />
          </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{commit}</span>
        </Typography>
      ) : null}
      {onOpenFeedback ? <FeedbackLink onOpen={onOpenFeedback} /> : null}
    </section>
  );
}
