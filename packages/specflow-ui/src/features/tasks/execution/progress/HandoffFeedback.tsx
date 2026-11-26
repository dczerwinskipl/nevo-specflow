import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, MarkdownDocument, ScrollArea, cn } from '@nevo/ui';
import { useMarkdownLabels } from '../../../../i18n/useMarkdownLabels';
import { InlineAction } from '../InlineAction';

/**
 * How the feedback is marked: `neutral` (a step that finished as expected), `attention` (what the
 * next attempt must act on: changes requested, a return) or `info` (an agent's result waiting for
 * the owner).
 */
export type HandoffFeedbackTone = 'neutral' | 'attention' | 'info';

/** Feedback longer than this, or of more lines, reads as cut in the preview (it fades out). */
const PREVIEW_CHARS = 200;
const PREVIEW_LINES = 3;

const TONE_ICONS = {
  attention: { name: 'circle-alert', className: 'text-status-attention' },
  info: { name: 'chat', className: 'text-content-muted' },
} as const;

/**
 * The feedback a hand-off left, the same wherever it appears (workflow-execution.md, "Last
 * hand-off" and "Take over and the attempt's history"): a "Show feedback" toggle, then the feedback
 * in the shared Markdown renderer.
 *
 * - `summary` (the Now block): a short preview of a few lines and "Open full feedback", which opens
 *   the detail view that holds it (`onOpenFull`, the work history). Without a detail view holding
 *   it (an agent's result still waiting for the owner) the whole feedback is shown in a bounded,
 *   scrollable box: arbitrarily long text never grows the Now block.
 * - `detail` (the work history, the detail view itself): the whole feedback.
 *
 * `initiallyOpen` opens it (feedback the next attempt or the owner must act on, or the attempt the
 * reader came to from "Open full feedback").
 */
export function HandoffFeedback({
  feedback,
  mode,
  tone = 'neutral',
  initiallyOpen = false,
  onOpenFull,
  scrollIntoView = false,
  showLabel,
}: {
  readonly feedback: string;
  readonly mode: 'summary' | 'detail';
  readonly tone?: HandoffFeedbackTone;
  readonly initiallyOpen?: boolean;
  /** Summary only: opens the detail view holding the whole feedback. */
  readonly onOpenFull?: (() => void) | undefined;
  /** Brings the opened feedback into view once (the reader came here to read it). */
  readonly scrollIntoView?: boolean;
  /** The toggle's closed label: "Show feedback" (Now), "View feedback" (history). */
  readonly showLabel: string;
}) {
  const { t } = useTranslation();
  const labels = useMarkdownLabels();
  const [open, setOpen] = useState(initiallyOpen);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const text = feedback.trim();
  const icon = tone === 'neutral' ? undefined : TONE_ICONS[tone];
  const preview = mode === 'summary' && onOpenFull !== undefined;
  const cut = preview && (text.length > PREVIEW_CHARS || text.split('\n').length > PREVIEW_LINES);

  useEffect(() => {
    // Synchronises with the page's scroll position: only for the entry the reader asked to see.
    if (scrollIntoView && initiallyOpen) {
      panel.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [scrollIntoView, initiallyOpen]);

  if (text === '') {
    return null;
  }

  const document = <MarkdownDocument source={text} labels={labels} headingOffset={3} />;

  return (
    <div
      className="grid min-w-0 justify-items-stretch gap-1.5 text-body-sm"
      data-handoff-feedback=""
    >
      <InlineAction
        className="inline-flex min-h-6 items-center gap-1 justify-self-start"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? t('workflowExecution.feedback.hide') : showLabel}
        <Icon
          name="chevron-down"
          size="sm"
          aria-hidden="true"
          className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')}
        />
      </InlineAction>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          className="flex min-w-0 items-start gap-2 rounded-control bg-surface-subtle p-3"
          data-feedback-mode={preview ? 'preview' : mode}
          data-feedback-tone={tone}
        >
          {icon ? (
            <span className="flex h-[1lh] shrink-0 items-center">
              <Icon name={icon.name} size="sm" aria-hidden="true" className={icon.className} />
            </span>
          ) : null}
          <div className="grid min-w-0 flex-1 justify-items-start gap-2">
            {preview ? (
              <>
                <div
                  className={cn(
                    // A few lines of the feedback; the rest is behind Open full feedback.
                    'max-h-24 w-full overflow-hidden',
                    cut && '[mask-image:linear-gradient(to_bottom,black_60%,transparent)]',
                  )}
                  data-feedback-preview=""
                >
                  {document}
                </div>
                <InlineAction onClick={onOpenFull}>
                  {t('workflowExecution.feedback.openFull')}
                </InlineAction>
              </>
            ) : mode === 'summary' ? (
              <ScrollArea
                aria-label={t('workflowExecution.feedback.label')}
                labelRole="group"
                className="max-h-64 w-full"
              >
                {document}
              </ScrollArea>
            ) : (
              <div className="w-full" data-agent-feedback="">
                {document}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
