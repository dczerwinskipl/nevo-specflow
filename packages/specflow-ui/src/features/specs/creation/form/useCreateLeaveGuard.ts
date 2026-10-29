import { useRef, useState, type RefObject } from 'react';
import { useBlocker } from '@tanstack/react-router';

export interface CreateLeaveGuard {
  /** The confirmation dialog is open. */
  open: boolean;
  /** Initial focus target of the dialog: the safe choice. */
  safeLeave: RefObject<HTMLButtonElement | null>;
  /** Keep editing: the navigation stays blocked. */
  stay: () => void;
  /** Leave anyway: the navigation proceeds. */
  discard: () => void;
  /** Where focus returns to when the dialog closes (the control that started the navigation). */
  restoreFocus: (event: { preventDefault(): void }) => void;
}

/**
 * Router leave guard of the Create form. Unsaved edits ask first. An unfinished operation never
 * blocks navigation: the server finishes it and the stored operation is resumed when the user comes
 * back to Create, so the form's own edits are not at risk either (they are the operation's request).
 * Completing the operation navigates on purpose and is always allowed. Closing the tab is the one
 * way to lose the resume, so the browser's own "leave site?" prompt covers an unfinished operation.
 */
export function useCreateLeaveGuard(options: {
  /** An operation is in flight or unresolved (see `CreateOperationFlags.unfinished`). */
  unfinished: boolean;
  /** The form differs from its initial state. */
  dirty: boolean;
  isNavigationAllowed: () => boolean;
}): CreateLeaveGuard {
  const { unfinished, dirty, isNavigationAllowed } = options;
  const [open, setOpen] = useState(false);
  const resolveLeave = useRef<((blocked: boolean) => void) | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const safeLeave = useRef<HTMLButtonElement>(null);
  const settle = (blocked: boolean) => {
    setOpen(false);
    resolveLeave.current?.(blocked);
    resolveLeave.current = null;
  };

  useBlocker({
    shouldBlockFn: () => {
      if (isNavigationAllowed()) {
        return false;
      }

      // The operation carries the form's content and outlives this screen: nothing to confirm.
      if (unfinished || !dirty) {
        return false;
      }

      return new Promise<boolean>((resolve) => {
        // A second navigation while the dialog is open must not orphan the first one.
        resolveLeave.current?.(true);
        origin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        resolveLeave.current = resolve;
        setOpen(true);
      });
    },
    enableBeforeUnload: unfinished || dirty,
  });

  return {
    open,
    safeLeave,
    stay: () => settle(true),
    discard: () => settle(false),
    restoreFocus: (event) => {
      if (origin.current?.isConnected) {
        event.preventDefault();
        origin.current.focus();
      }
    },
  };
}
