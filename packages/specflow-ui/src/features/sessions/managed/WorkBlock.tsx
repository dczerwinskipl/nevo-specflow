import { useTranslation } from 'react-i18next';
import { Wrench } from 'lucide-react';
import { Icon, Spinner, Typography, cn } from '@nevo/ui';
import type { WorkBlockModel } from './workBlockModel';
import { describeWorkBlock } from './workDigest';
import { workStateTextClassName } from './workStatus';

/**
 * The tool row of one work stage in the Conversation (full-session.md "Conversation"), right under
 * that stage's Commentary: what the stage did by operation kind, its failed tool actions on their
 * own line and, on the active Turn's last stage, what is happening right now with a spinner. How the
 * Turn ended is never said here (`TurnOutcomeEvent` says it once). The whole row is the one click
 * target into the Turn's Work history (chevron + hover, no extra visible label).
 *
 * Pressed (a tap on a phone, where there is no hover) shows the selected surface, so the tap
 * visibly lands on the whole row. The leading icon sits in a small tile, without a container at
 * rest (layout-and-containment: borderless-first; hover/focus show the surface). Colour is used
 * only for the exception: failed tool actions.
 */
export function WorkBlock({ block, onInspect }: { block: WorkBlockModel; onInspect: () => void }) {
  const { t } = useTranslation();
  const text = describeWorkBlock(block, t);
  // While `block.live` is set the Turn is still running, so the icon stays the spinner even when a
  // tool has already failed; the red failure line itself renders below either way.
  const danger = !block.live && !!text.failed;

  return (
    <article data-entry-id={block.id} data-work-block="" className="grid min-w-0">
      <span className="sr-only">{t('managedSession.entry.work-summary')}</span>
      <button
        type="button"
        onClick={onInspect}
        className="group/work flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-control px-2 py-2 text-left outline-none transition-colors hover:bg-surface-hover active:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-control bg-surface-control',
            workStateTextClassName(danger ? 'danger' : 'neutral'),
          )}
        >
          {block.live ? (
            <Spinner size="sm" />
          ) : danger ? (
            <Icon name="circle-alert" size="sm" />
          ) : (
            <Icon name={Wrench} size="sm" />
          )}
        </span>
        {/* The first line is centred on the 28px tile, like the chevron: a `body-md` summary
            (20px line) sits 4px down, a `body-sm` first line (16px: live or failed without a
            summary) 6px down. */}
        <span
          data-work-block-text=""
          className={cn(
            'grid min-w-0 flex-1 gap-1 [overflow-wrap:anywhere]',
            text.summary ? 'pt-1' : 'pt-1.5',
          )}
        >
          {/* `body-md` (the conversation's own reading size) for the counts, one step quieter in
              colour than the answer; the failed/live lines are `body-sm` supporting text, toned
              from the shared state vocabulary Work history also uses (`workStatus.ts`). */}
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
          {/* Visible, but `aria-hidden`: the live announcement lives in the sr-only sibling region
              below, OUTSIDE this `button` (a live region inside a button becomes part of its
              accessible name, so every change would re-announce the whole control). */}
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
      {text.live && (
        <span role="status" aria-live="polite" className="sr-only">
          {t('managedSession.workSummary.running')} {text.live}
        </span>
      )}
    </article>
  );
}
