import { useRef, useState } from 'react';
import { useOpenedItems, type OpenedItem } from '@nevo/ui';
import type { TabContentProvider } from './types.stories-support';

/**
 * Host adapter over the design-system `useOpenedItems`: open-or-activate, neighbour rule and the
 * async close guard come from there. What stays here is the product part of the guard, the
 * unsaved-changes dialog: a dirty item parks the close until `confirmClose` / `cancelClose`.
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
    canClose: (id) =>
      content(id).dirty
        ? new Promise<boolean>((resolve) => {
            answer.current = resolve;
            setPendingClose(id);
          })
        : true,
  });

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
    requestClose: (id: string) => void opened.requestClose(id),
    cancelClose: () => settle(false),
    confirmClose: (action: 'save' | 'discard') => {
      if (!pendingClose) return;
      content(pendingClose).settle(action);
      settle(true);
    },
  };
}

export type TabHost = ReturnType<typeof useTabHost>;
