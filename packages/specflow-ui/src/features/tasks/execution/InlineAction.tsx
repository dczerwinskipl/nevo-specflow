import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@nevo/ui';

/**
 * An in-page action that reads as a link inside a sentence ("See Tasks", "Create findings
 * document", "Abandon instead"): it acts here rather than navigating, so it is a button.
 */
export function InlineAction({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'cursor-pointer rounded-control-inline text-left font-medium text-content-link underline-offset-2 hover:text-content-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring',
        className,
      )}
      {...props}
    />
  );
}

/** Moves the reader to a section heading on this page (the heading takes focus). */
export function goToHeading(id: string) {
  const heading = document.getElementById(id);
  if (!heading) {
    return;
  }

  heading.scrollIntoView({ block: 'start' });
  if (!heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1');
  }

  heading.focus({ preventScroll: true });
}
