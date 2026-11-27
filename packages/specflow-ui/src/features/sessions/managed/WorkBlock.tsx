import { useTranslation } from 'react-i18next';
import { Icon, Spinner, Typography, cn } from '@nevo/ui';
import type { WorkBlockModel } from './workBlockModel';
import { describeWorkBlock } from './workDigest';
import { workOperationIcon } from './workOperationIcon';
import { workStateTextClassName } from './workStatus';

/**
 * The agent-work element of one work stage in the Conversation (full-session.md "Work block"),
 * right under that stage's Commentary: one light row, "[icon] 5 commands ›" (owner, 2026-11-26:
 * the transcript is first a conversation, the work a quiet way into it). It says what was done by
 * kind ("5 commands", "1 command · 2 reads"), failed tool actions on their own line in the error
 * tone (always visible in the transcript) and, on the active Turn's last stage, what is happening
 * right now with a spinner. How the Turn ended is never said here (`TurnOutcomeEvent` says it once).
 *
 * No surface of its own: the leading icon is the kind the stage did most (`workOperationIcon`, the
 * icons Work history uses too) and colour marks only the exception. The whole row is the touch
 * target, full width, and opens Work history at this stage, expanded and scrolled to; the chevron
 * right means "opens", and Back returns to the same place in the conversation.
 */
export function WorkBlock({ block, onInspect }: { block: WorkBlockModel; onInspect: () => void }) {
  const { t } = useTranslation();
  const text = describeWorkBlock(block, t);
  // While `block.live` is set the Turn is still running, so the icon stays the spinner even when a
  // tool has already failed; the red failure line itself renders below either way.
  const danger = !block.live && !!text.failed;
  const line = text.summary ?? text.title;

  return (
    <article data-entry-id={block.id} data-work-block="" className="grid min-w-0">
      <span className="sr-only">{t('managedSession.entry.work-summary')}</span>
      <button
        type="button"
        onClick={onInspect}
        className={cn(
          // Full width and at least the target height; the hover surface bleeds into the gutter so
          // the icon stays on the prose's left edge.
          'group/work -mx-2 grid min-h-(--target-size) w-[calc(100%+1rem)] min-w-0 cursor-pointer grid-cols-[var(--spacing-icon-sm)_minmax(0,1fr)] items-start gap-x-2 rounded-control px-2 py-1 text-left outline-none transition-colors hover:bg-surface-hover active:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus-ring',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-[var(--text-body-sm--line-height)] items-center justify-center',
            danger ? workStateTextClassName('danger') : 'text-content-muted',
          )}
        >
          {block.live ? (
            <Spinner size="sm" />
          ) : danger ? (
            <Icon name="circle-alert" size="sm" />
          ) : (
            <Icon name={workOperationIcon(text.operation)} size="sm" />
          )}
        </span>
        <span data-work-block-text="" className="grid min-w-0 gap-0.5 [overflow-wrap:anywhere]">
          {line && (
            <Typography
              as="span"
              variant="body-sm"
              className="inline-flex min-w-0 items-center gap-1 text-content-muted transition-colors group-hover/work:text-content-primary"
            >
              <span className="min-w-0">{line}</span>
              <Icon name="chevron-right" size="sm" aria-hidden="true" className="shrink-0" />
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
              className="line-clamp-2 text-content-muted"
              title={text.live}
            >
              {text.live}
            </Typography>
          )}
          <span className="sr-only">{t('managedSession.workSummary.open')}</span>
        </span>
      </button>
      {text.live && (
        <span role="status" aria-live="polite" className="sr-only">
          {t('managedSession.workSummary.running')} {text.live}
        </span>
      )}
    </article>
  );
}
