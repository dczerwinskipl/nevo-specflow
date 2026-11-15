/**
 * A dialog that names its initial focus (`data-initial-focus`, the harmless Dismiss of a blocked
 * Close or Abandon) opens there instead of on its first link.
 */
export function focusInitial(event: Event) {
  const target = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
    '[data-initial-focus]',
  );
  if (target) {
    event.preventDefault();
    target.focus();
  }
}
