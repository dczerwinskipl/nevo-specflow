import { Icon, Spinner, cn, type IconGlyph } from '@nevo/ui';

/** How the operation currently stands, as one glance: turning, done, needs a look, or not done. */
export type OperationStatusTone = 'running' | 'success' | 'attention' | 'danger';

/** `md` heads an operation's own page; `sm` marks one row of a list. */
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
  md: 'size-12 rounded-composite',
  sm: 'size-8 rounded-control',
};

/**
 * The status mark in front of an operation's heading: a tile with a turning spinner while it runs
 * (it stops under reduced motion) and a static icon otherwise. Decorative: the heading and the
 * live status text carry the meaning, so it is hidden from assistive technology.
 */
export function OperationStatusTile({
  tone,
  size = 'md',
  className,
}: {
  tone: OperationStatusTone;
  size?: OperationStatusTileSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-operation-status={tone}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border-subtle bg-surface-subtle',
        sizeClassName[size],
        toneColor[tone],
        className,
      )}
    >
      {tone === 'running' ? (
        <Spinner size={size === 'sm' ? 'sm' : 'md'} className={toneColor.running} />
      ) : (
        <Icon name={toneGlyph[tone]} size={size === 'sm' ? 'sm' : 'md'} />
      )}
    </span>
  );
}
