import type { AriaAttributes } from 'react';

export type TextControlDesignState = 'default' | 'focus' | 'disabled' | 'invalid';

export function isAriaInvalid(value: AriaAttributes['aria-invalid']) {
  return value === true || value === 'true' || value === 'grammar' || value === 'spelling';
}

/** Capture-only projection; runtime interaction styling remains native CSS state. */
export function textControlDesignState({
  ariaInvalid,
  autoFocus,
  disabled,
}: {
  ariaInvalid?: AriaAttributes['aria-invalid'];
  autoFocus?: boolean;
  disabled?: boolean;
}): TextControlDesignState {
  if (disabled) return 'disabled';
  if (isAriaInvalid(ariaInvalid)) return 'invalid';
  if (autoFocus) return 'focus';
  return 'default';
}

