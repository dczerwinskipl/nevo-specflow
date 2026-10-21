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
 * Router leave guard of the Create form. An unfinished operation blocks silently; unsaved edits ask
 * first. Completing the operation navigates on purpose and is always allowed.
 */
export function useCreateLeaveGuard(options: {
  /** An in-flight or unresolved operation: leaving would abandon it. */
  blocksLeave: boolean;
  /** The form differs from its initial state. */
  dirty: boolean;
  isNavigationAllowed: () => boolean;
}): CreateLeaveGuard {
  const { blocksLeave, dirty, isNavigationAllowed } = options;
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
      if (isNavigationAllowed()) return false;
      if (blocksLeave) return true;
      if (!dirty) return false;
      return new Promise<boolean>((resolve) => {
        origin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        resolveLeave.current = resolve;
        setOpen(true);
      });
    },
    enableBeforeUnload: blocksLeave || dirty,
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
