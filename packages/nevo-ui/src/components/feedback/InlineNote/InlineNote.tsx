import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../../lib';
import { Icon, type IconGlyph } from '../../foundations/Icon';

export type InlineNoteTone = 'info' | 'attention' | 'danger';

export interface InlineNoteProps extends HTMLAttributes<HTMLParagraphElement> {
  /** `info` is a calm explanation; `attention` a caveat the reader should not miss; `danger` a failure or a missing required thing. */
  tone?: InlineNoteTone;
  /** Override the tone icon. Pass null to show the text alone. */
  icon?: IconGlyph | null;
}

const toneIcons = {
  info: 'info',
  attention: 'triangle-alert',
  danger: 'circle-alert',
} as const satisfies Record<InlineNoteTone, IconGlyph>;

const toneIconClasses = {
  info: 'text-content-muted',
  attention: 'text-status-attention',
  danger: 'text-status-danger',
} as const satisfies Record<InlineNoteTone, string>;

/**
 * A short explanatory sentence with a leading icon and no container: the quiet counterpart of
 * `Alert`. Use it for a fact or caveat that belongs to the content next to it (a note under a
 * value, the reason an action is unavailable). `tone` is `info`, `attention` or `danger` (a failure
 * or a missing required thing; the text, not the colour, carries the meaning). It carries no live-region role; wrap it in one
 * (or use `Alert`) when it must be announced.
 */
export const InlineNote = forwardRef<HTMLParagraphElement, InlineNoteProps>(function InlineNote(
  { children, className, icon, tone = 'info', ...props },
  ref,
) {
  const resolvedIcon = icon === undefined ? toneIcons[tone] : icon;

  return (
    <p
      ref={ref}
      className={cn(
        'flex min-w-0 items-start gap-2 text-body-sm text-content-secondary',
        className,
      )}
      {...props}
    >
      {resolvedIcon ? (
        // One line box tall: the icon is centred on the first line, however many lines follow.
        <span className="flex h-[1lh] shrink-0 items-center">
          <Icon
            name={resolvedIcon}
            size="sm"
            aria-hidden="true"
            className={toneIconClasses[tone]}
          />
        </span>
      ) : null}
      <span className="min-w-0">{children}</span>
    </p>
  );
});
