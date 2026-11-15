import { StatusIndicator, cn } from '@nevo/ui';

/**
 * A state of a context the reader must always see, in its own slot after the name (never a segment
 * of the detail line): `attention` is the informational amber of local changes (an owner decision
 * for this status), `danger` that the context cannot be used now, with the reason as text.
 */
export interface ContextSwitcherStatusValue {
  readonly tone: 'attention' | 'danger';
  readonly text: string;
}

/** The status dot and its short text (on the trigger it never truncates: the name gives way). */
export function ContextSwitcherStatus({
  status,
  className,
}: {
  status: ContextSwitcherStatusValue;
  className?: string;
}) {
  return (
    <span
      className={cn('flex items-start gap-1.5 text-body-sm text-content-secondary', className)}
      data-context-switcher-status={status.tone}
    >
      {/* One line high, so the dot stays on the first line when a long reason wraps. */}
      <span className="flex h-lh shrink-0 items-center">
        <StatusIndicator tone={status.tone} />
      </span>
      <span className="min-w-0">{status.text}</span>
    </span>
  );
}
