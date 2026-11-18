import { Icon, StatusIndicator, cn } from '@nevo/ui';
import type { SemanticSupporting } from './OperationalRow.types';

export interface SemanticSupportingLineProps {
  readonly line: SemanticSupporting;
  /**
   * At most two lines of text, wrapped evenly (a supporting line under a status); `1` keeps it to
   * one line (two supporting lines sharing the two-line budget).
   */
  readonly clamp?: boolean | 1;
  readonly className?: string;
}

/**
 * A status or reason line: its mark (an icon or a `StatusIndicator` dot) in a fixed slot on the
 * first text line, then the text in the line's tone. A line without a mark that `reserveMark`s
 * keeps the empty slot, so its text lines up with marked lines above and below it.
 */
export function SemanticSupportingLine({
  line,
  clamp = false,
  className,
}: SemanticSupportingLineProps) {
  const mark = line.icon ? (
    <Icon name={line.icon} size="sm" className={cn('shrink-0', line.iconClassName)} />
  ) : line.indicator ? (
    <StatusIndicator tone={line.indicator} />
  ) : null;

  return (
    <span
      className={cn(
        'inline-flex min-w-0 gap-1.5 [overflow-wrap:anywhere] text-content-secondary',
        // The mark sits on the first line of the text, also when the text wraps.
        'items-start',
        line.tone === 'attention' && 'text-status-attention font-medium',
        line.tone === 'danger' && 'text-status-danger font-medium',
        line.tone === 'success' && 'text-status-success',
        line.tone === 'info' && 'text-status-info font-medium',
        line.textClassName,
        className,
      )}
    >
      {mark || line.reserveMark ? (
        <span
          className="flex h-[1lh] w-4 shrink-0 items-center justify-center"
          data-mark-slot={mark ? undefined : 'empty'}
        >
          {mark}
        </span>
      ) : null}
      <span
        className={cn(
          'min-w-0',
          clamp === 1 ? 'line-clamp-1' : clamp && 'line-clamp-2 [text-wrap:pretty]',
        )}
      >
        {line.text}
      </span>
    </span>
  );
}
