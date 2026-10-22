import type { ReactNode } from 'react';

/**
 * The reason a setting is unavailable. The switch above it is `aria-disabled` (reachable, muted
 * label and control, see `SwitchField`); the reason itself stays at full strength so it remains
 * readable.
 */
export function UnavailableReason({ children }: { children: ReactNode }) {
  return <span className="text-content-secondary">{children}</span>;
}
