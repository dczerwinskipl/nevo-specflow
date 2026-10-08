import { Icon, StatusIndicator, Typography, cn, type StatusTone } from '@nevo/ui';

export interface OperationalGroupHeaderProps {
  readonly label: string;
  readonly count?: number;
  readonly tone?: StatusTone;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly controlsId?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly selectable?: boolean;
}

export function OperationalGroupHeader({
  label,
  count,
  tone,
  expanded,
  onToggle,
  controlsId,
  ariaLabel,
  className,
  selectable: _selectable = false,
}: OperationalGroupHeaderProps) {
  return (
    <div
      className={cn(
        'flex min-h-control-height-default min-w-0 items-center gap-x-3 rounded-control bg-surface-control px-2',
        className,
      )}
      data-spec-section-header
    >
      {/* Utility slot: 32px to align chevron with checkboxes when selectable */}
      <div className="flex size-8 shrink-0 items-center justify-center">
        <button
          type="button"
          className="flex h-control-height-default w-full cursor-pointer items-center justify-center rounded-control outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
          aria-expanded={expanded}
          aria-controls={controlsId}
          aria-label={ariaLabel}
          onClick={onToggle}
        >
          <Icon
            className={cn('text-content-muted transition-transform', expanded && 'rotate-90')}
            name="chevron-right"
            size="sm"
          />
        </button>
      </div>

      {tone ? (
        <div className="flex size-4 shrink-0 items-center justify-center">
          <StatusIndicator tone={tone} />
        </div>
      ) : null}

      <div className="flex min-w-0 items-baseline gap-2 pr-3">
        <Typography as="h2" variant="label-sm" className="font-semibold text-content-primary">
          {label}
        </Typography>
        {count !== undefined ? (
          <Typography variant="body-sm" className="text-content-muted">
            {count}
          </Typography>
        ) : null}
      </div>
    </div>
  );
}
