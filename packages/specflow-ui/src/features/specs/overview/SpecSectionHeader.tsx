import { cn, Icon, StatusIndicator, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { sectionTone, type CurrentSpecSectionId } from './model';
import { scanGrid } from './geometry';

export function SpecSectionHeader({
  label,
  count,
  sectionId,
  expanded,
  searching,
  controls,
  onToggle,
}: {
  readonly label: string;
  readonly count: number;
  readonly sectionId: CurrentSpecSectionId;
  readonly expanded: boolean;
  readonly searching: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        scanGrid,
        'min-h-control-height-default items-center rounded-control bg-surface-control',
      )}
      data-spec-section-header
    >
      <button
        type="button"
        className="flex h-control-height-default w-full cursor-pointer items-center justify-center rounded-control outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring aria-disabled:cursor-default"
        aria-expanded={expanded}
        aria-disabled={searching}
        aria-controls={controls}
        aria-label={t(
          searching
            ? 'specs.sectionSearchExpanded'
            : expanded
              ? 'specs.collapseSection'
              : 'specs.expandSection',
          { label },
        )}
        onClick={() => {
          if (!searching) onToggle();
        }}
      >
        <Icon
          className={cn('text-content-muted', expanded && 'rotate-90')}
          name="chevron-right"
          size="sm"
        />
      </button>
      <StatusIndicator tone={sectionTone[sectionId]} />
      <div className="flex min-w-0 items-baseline gap-2 pr-3">
        <Typography as="h2" variant="label-sm" className="text-content-primary">
          {label}
        </Typography>
        <Typography variant="body-sm" className="text-content-muted">
          {count}
        </Typography>
      </div>
    </div>
  );
}
