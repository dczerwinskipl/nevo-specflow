import { Icon, StatusIndicator, Typography } from '@nevo/ui';

import { steeringTone, type SteeringKind } from './model';

export function SpecGroupHeader({
  label,
  count,
  kind,
}: {
  readonly label: string;
  readonly count: number;
  readonly kind?: SteeringKind;
}) {
  return (
    <summary className="grid min-h-control-height-default cursor-pointer list-none grid-cols-[calc(var(--spacing)*12)_minmax(0,1fr)] items-center rounded-control bg-surface-control outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
      <span className="flex items-center justify-center gap-1">
        <Icon
          className="text-content-muted group-open/section:rotate-90"
          name="chevron-right"
          size="sm"
        />
        {kind ? <StatusIndicator tone={steeringTone[kind]} /> : null}
      </span>
      <div className="flex min-w-0 items-center gap-2 pr-3">
        <Typography as="h2" variant="label-sm" className="text-content-primary">
          {label}
        </Typography>
        <Typography variant="body-sm" className="text-content-muted">
          {count}
        </Typography>
      </div>
    </summary>
  );
}
