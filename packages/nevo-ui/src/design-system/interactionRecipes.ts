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

/**
 * Expands the interactive hit area of a visually smaller control to `--target-size`
 * (24px on every pointer, 44px on coarse pointers) with a pseudo-element owned by the control.
 * Layout and visual size are untouched; clicks on the pseudo-element hit the control itself.
 * Applying it makes the element `relative`; do not combine it with another positioning utility.
 */
export const hitAreaClassName =
  "relative after:absolute after:left-1/2 after:top-1/2 after:size-[max(100%,var(--target-size))] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

/** Same as `hitAreaClassName` but expands only the block axis (text-width labels already span the row). */
export const hitAreaBlockClassName =
  "relative after:absolute after:inset-x-0 after:top-1/2 after:h-[max(100%,var(--target-size))] after:-translate-y-1/2 after:content-['']";
