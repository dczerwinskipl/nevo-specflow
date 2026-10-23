import { useEffect, useRef, useState } from 'react';
import { useOpenedItems, type OpenedItem } from '@nevo/ui';
import type { TabContentProvider } from './types.stories-support';

/**
 * Host adapter over the design-system `useOpenedItems`: open-or-activate, neighbour rule and the
 * async close guard come from there. What stays here is the product part of the guard, the
 * unsaved-changes dialog: a dirty item parks the close (one at a time) until `confirmClose` / `cancelClose`.
 */
export function useTabHost(
  initial: { open: string[]; active: string | null },
  content: TabContentProvider,
  initialPendingClose: string | null = null,
) {
  const [pendingClose, setPendingClose] = useState<string | null>(initialPendingClose);
  const answer = useRef<((allowed: boolean) => void) | null>(null);
  const opened = useOpenedItems<OpenedItem>({
    initialItems: initial.open.map((id) => ({ id })),
    initialActiveId: initial.active,
    canClose: (id) => {
      if (!content(id).dirty) return true;
      // One unsaved-changes dialog at a time: while it is open, other close requests are refused
      // (resolved false) instead of overwriting the pending answer.
      if (answer.current || pendingClose) return false;
      return new Promise<boolean>((resolve) => {
        answer.current = resolve;
        setPendingClose(id);
      });
    },
  });
  // Unmounting while the dialog is open resolves the parked request as "keep open".
  useEffect(
    () => () => {
      answer.current?.(false);
      answer.current = null;
    },
    [],
  );

  const settle = (allowed: boolean) => {
    if (answer.current) answer.current(allowed);
    else if (allowed && pendingClose) opened.close(pendingClose);
    answer.current = null;
    setPendingClose(null);
  };

  return {
    open: opened.items.map((item) => item.id),
    active: opened.activeId,
    pendingClose,
    setActive: opened.activate,
    openItem: (id: string) => opened.open({ id }),
    closeAll: opened.closeAll,
    // A throwing guard is a refusal here: the item stays open and the error is reported.
    requestClose: (id: string) =>
      void opened.requestClose(id).catch((error: unknown) => {
        console.error(`Could not close "${id}":`, error);
      }),
    cancelClose: () => settle(false),
    confirmClose: (action: 'save' | 'discard') => {
      if (!pendingClose) return;
      content(pendingClose).settle(action);
      settle(true);
    },
  };
}

export type TabHost = ReturnType<typeof useTabHost>;
