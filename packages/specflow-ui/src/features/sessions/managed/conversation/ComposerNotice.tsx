import type { ReactNode } from 'react';
import { cn } from '@nevo/ui';

/**
 * The opaque surface of a notice docked above the Composer (full-session.md "Composer"): a pending
 * question or permission, an unknown outcome, a refused Send, an incompatible work mode. The
 * conversation scrolls underneath the docked Composer, so a notice there gets the Composer's own
 * material and elevation (`bg-surface-raised`, `shadow-lg`) under its tone: the transcript never
 * shows through it. The scroll area already ends above the whole docked stack (its measured height).
 */
export function ComposerNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-composer-notice=""
      className={cn('min-w-0 rounded-composite bg-surface-raised shadow-lg', className)}
    >
      {children}
    </div>
  );
}
