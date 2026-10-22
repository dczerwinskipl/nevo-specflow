import { Icon, Spinner, cn, type IconGlyph } from '@nevo/ui';

/** How the operation currently stands, as one glance: turning, done, needs a look, or not done. */
export type OperationStatusTone = 'running' | 'success' | 'attention' | 'danger';

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

/**
 * The status mark in front of an operation's heading: a tile with a turning spinner while it runs
 * (it stops under reduced motion) and a static icon otherwise. Decorative: the heading and the
 * live status text carry the meaning, so it is hidden from assistive technology.
 */
export function OperationStatusTile({
  tone,
  className,
}: {
  tone: OperationStatusTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-operation-status={tone}
      className={cn(
        'inline-flex size-12 shrink-0 items-center justify-center rounded-composite border border-border-subtle bg-surface-subtle',
        toneColor[tone],
        className,
      )}
    >
      {tone === 'running' ? (
        <Spinner size="md" className={toneColor.running} />
      ) : (
        <Icon name={toneGlyph[tone]} size="md" />
      )}
    </span>
  );
}
