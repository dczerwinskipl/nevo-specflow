import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import { Icon, Spinner, Typography, cn } from '@nevo/ui';
import type { WorkBlockModel } from './workBlockModel';
import { describeWorkBlock } from './workDigest';
import { workStateTextClassName } from './workStatus';

/**
 * One Turn's Work in the Conversation (session-chat-v10-design.md §3.1, owner direction: "widzę co
 * aktualnie robi, widzę ile już zrobił"). Top line: cumulative work so far by kind; under it, while
 * the Turn is live, what is happening right now with a spinner; once settled, the Turn's terminal
 * outcome if it was not a plain completion. The whole block is the one click target into the Turn's
 * Work history (chevron + hover, no extra visible label).
 *
 * The leading icon sits in a small tile so the block does not drown in conversation text, without
 * a container at rest (layout-and-containment: borderless-first; hover/focus show the surface).
 * Colour is used only for exceptions: failed tool actions and a failed/stopped/interrupted Turn.
 */
export function WorkBlock({ block, onInspect }: { block: WorkBlockModel; onInspect: () => void }) {
  const { t } = useTranslation();
  const text = describeWorkBlock(block, t);
  // Icon follows the Turn's OWN state, not a mid-Turn failure line: while `block.live` is set the
  // Turn is still running (work may yet succeed), so the icon stays the spinner even when a tool
  // has already failed — only `text.outcome` (set once the Turn settles, never while live, see
  // `workBlockModel.ts`) promotes the icon to alert. The red failure LINE itself still renders
  // immediately below, independent of the icon.
  const danger = !block.live && (!!text.failed || text.outcome?.tone === 'danger');
  const attention = !block.live && !danger && text.outcome?.tone === 'attention';

  return (
    <article data-entry-id={block.id} data-work-block="" className="grid min-w-0">
      <span className="sr-only">{t('managedSession.entry.work-summary')}</span>
      <button
        type="button"
        onClick={onInspect}
        className="group/work flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-control px-2 py-2 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-control bg-surface-control',
            workStateTextClassName(danger ? 'danger' : attention ? 'attention' : 'neutral'),
          )}
        >
          {block.live ? (
            <Spinner size="sm" />
          ) : danger || attention ? (
            <Icon name="circle-alert" size="sm" />
          ) : (
            <Icon name={Wrench} size="sm" />
          )}
        </span>
        <span className="grid min-w-0 flex-1 gap-1 pt-1 [overflow-wrap:anywhere]">
          {/* `body-md` (14px, the conversation's own reading size) for the aggregate itself, one
              step quieter in colour than the answer; the exception/live lines below stay
              `body-sm` supporting text. Tones come from the shared state vocabulary
              (`workStatus.ts`) Work history also uses for the very same operations. */}
          {text.summary && (
            <Typography as="span" variant="body-md" className="text-content-secondary">
              {text.summary}
            </Typography>
          )}
          {text.failed && (
            <Typography
              as="span"
              variant="body-sm"
              className={cn('font-medium', workStateTextClassName('danger'))}
            >
              {text.failed}
            </Typography>
          )}
          {text.outcome && (
            <Typography
              as="span"
              variant="body-sm"
              className={cn('font-medium', workStateTextClassName(text.outcome.tone))}
            >
              {text.outcome.text}
            </Typography>
          )}
          {/* Visible, but `aria-hidden` — the live announcement itself lives in the sr-only sibling
              region below, OUTSIDE this `button` (a `role="status"` live
              region nested INSIDE a button becomes part of that button's own accessible name, so
              every live-text change would re-announce the WHOLE control, not just the update).
              The leading icon tile
              already carries the spinner while live (see above), so this line doesn't repeat one of
              its own. */}
          {text.live && (
            <Typography
              as="span"
              variant="body-sm"
              aria-hidden="true"
              className="line-clamp-2 text-content-secondary"
              title={text.live}
            >
              {text.live}
            </Typography>
          )}
          <span className="sr-only">{t('managedSession.workSummary.open')}</span>
        </span>
        <Icon
          name="chevron-right"
          size="sm"
          className="mt-1.5 shrink-0 text-content-muted transition-colors group-hover/work:text-content-secondary"
        />
      </button>
      {/* The live region itself: a sibling of the button, never part of its accessible name, so a
          live-text change is announced on its own instead of re-announcing the whole "open Work
          history" control. */}
      {text.live && (
        <span role="status" aria-live="polite" className="sr-only">
          {t('managedSession.workSummary.running')} {text.live}
        </span>
      )}
    </article>
  );
}
