export const actionVariantClasses = {
  primary:
    'border-transparent bg-action-primary text-content-on-primary hover:bg-action-primary-hover',
  secondary:
    'border-border-default bg-action-secondary text-content-secondary hover:border-border-strong hover:bg-action-secondary-hover hover:text-content-primary',
  ghost:
    'border-transparent bg-transparent text-content-muted hover:bg-surface-hover hover:text-content-primary',
  destructive:
    'border-action-danger/40 bg-transparent text-action-danger hover:border-action-danger/60 hover:bg-action-danger-subtle',
} as const;

export const fastColorTransitionClassName =
  'transition-colors [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none';

export type ActionVariant = keyof typeof actionVariantClasses;
