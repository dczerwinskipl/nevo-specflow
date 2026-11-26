import { useTranslation } from 'react-i18next';
import { Icon, Spinner, Typography, cn } from '@nevo/ui';
import type { WorkBlockModel } from './workBlockModel';
import { describeWorkBlock } from './workDigest';
import { workOperationIcon } from './workOperationIcon';
import { workStateTextClassName } from './workStatus';

/**
 * The agent-work element of one work stage in the Conversation (full-session.md "Work block"),
 * right under that stage's Commentary: always the same contained row, so the agent's work reads as
 * one kind of element between the paragraphs, never as a loose button. Its title says how much was
 * done ("6 tool actions", or "2 commands" when all were of one kind), the breakdown by kind under
 * it when there were several ("5 commands · 1 read"), failed tool actions on their own line and, on
 * the active Turn's last stage, what is happening right now with a spinner. How the Turn ended is
 * never said here (`TurnOutcomeEvent` says it once). The whole row opens the Turn's Work history.
 *
 * The leading icon is the kind the stage did most (`workOperationIcon`, the icons Work history uses
 * too); colour is used only for the exception: failed tool actions.
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
        className="group/work flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-control bg-surface-subtle px-3 py-2.5 text-left outline-none transition-colors hover:bg-surface-hover active:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex shrink-0 items-center justify-center',
            workStateTextClassName(danger ? 'danger' : 'neutral'),
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
        <span
          data-work-block-text=""
          className="grid min-w-0 flex-1 gap-0.5 [overflow-wrap:anywhere]"
        >
          {text.title && (
            <Typography as="span" variant="body-md" className="font-medium text-content-primary">
              {text.title}
            </Typography>
          )}
          {text.detail && (
            <Typography as="span" variant="body-sm" className="text-content-secondary">
              {text.detail}
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
          className="shrink-0 text-content-muted transition-colors group-hover/work:text-content-secondary"
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
