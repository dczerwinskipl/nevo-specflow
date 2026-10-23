import { Icon, Spinner, cn, type IconGlyph } from '@nevo/ui';

/** How the operation currently stands, as one glance: turning, done, needs a look, or not done. */
export type OperationStatusTone = 'running' | 'success' | 'attention' | 'danger';

/** `md` heads an operation's own page (a tile); `sm` marks one row of a list (a bare icon). */
export type OperationStatusTileSize = 'sm' | 'md';

const toneGlyph: Record<Exclude<OperationStatusTone, 'running'>, IconGlyph> = {
  success: 'circle-check',
  attention: 'info',
  danger: 'circle-alert',
};

const toneColor: Record<OperationStatusTone, string> = {
  running: 'text-status-info',
  success: 'text-status-success',
  attention: 'text-status-attention',
  danger: 'text-status-danger',
};

const sizeClassName: Record<OperationStatusTileSize, string> = {
  md: 'size-12 rounded-composite border border-border-subtle bg-surface-subtle',
  sm: 'size-6',
};

/**
 * The status mark in front of an operation's heading or row: a turning spinner while it runs
 * (it stops under reduced motion) and a static icon otherwise. A page that already shows its own
 * spinner (the active step of a checklist) passes `animated={false}`: the mark then stays a
 * static specification icon while the operation runs, so one screen never turns twice. Decorative:
 * the heading and the live status text carry the meaning, so it is hidden from assistive technology.
 */
export function OperationStatusTile({
  tone,
  size = 'md',
  animated = true,
  className,
}: {
  tone: OperationStatusTone;
  size?: OperationStatusTileSize;
  animated?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-operation-status={tone}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        sizeClassName[size],
        toneColor[tone],
        className,
      )}
    >
      {tone === 'running' && !animated ? (
        <Icon name="file" size={size === 'sm' ? 'sm' : 'md'} />
      ) : tone === 'running' ? (
        <Spinner size={size === 'sm' ? 'sm' : 'md'} className={toneColor.running} />
      ) : (
        <Icon name={toneGlyph[tone]} size={size === 'sm' ? 'sm' : 'md'} />
      )}
    </span>
  );
}
