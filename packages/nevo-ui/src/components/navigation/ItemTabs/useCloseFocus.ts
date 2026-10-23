import { useLayoutEffect, useRef } from 'react';
import type { ItemTab } from './itemTabsTypes';

/**
 * Focus management after an item closes. Once the host has actually removed the item, focus moves
 * to its right neighbour (else the left one, else the active tab). A cancelled close (guard said
 * no) leaves focus alone. When the last item closes there is nothing to focus: the host decides
 * where focus goes next.
 *
 * Closing from the Opened menu (a portal outside the root) is handled too: focus moves out of the
 * menu and Radix's own "return focus to the trigger" is suppressed, because the trigger may be gone
 * (everything fits the strip again) which would drop focus to `body`.
 */
export function useCloseFocus(
  items: readonly ItemTab[],
  root: HTMLElement | null,
  closeItem: (id: string) => void,
) {
  const pending = useRef<{ id: string; neighbourId: string | null } | null>(null);
  const fromMenu = useRef(false);
  const settled = useRef<HTMLElement | null>(null);

  const request = (id: string, viaMenu: boolean) => {
    const index = items.findIndex((item) => item.id === id);
    pending.current = { id, neighbourId: (items[index + 1] ?? items[index - 1])?.id ?? null };
    fromMenu.current = viaMenu;
    closeItem(id);
  };
  /** Close from a tab, its x or the keyboard on the strip. */
  const onClose = (id: string) => request(id, false);
  /**
   * The ONE close entry for everything inside the Opened menu (Close menuitem, row x, Delete on a
   * row), so none of them can skip the menu-aware focus handling.
   */
  const onCloseFromMenu = (id: string) => request(id, true);

  useLayoutEffect(() => {
    const closing = pending.current;
    if (!closing || !root || items.some((item) => item.id === closing.id)) return;
    pending.current = null;
    const viaMenu = fromMenu.current;
    const owner = document.activeElement;
    const inOpenMenu = viaMenu && Boolean(owner?.closest('[role="menu"]')?.isConnected);
    if (owner && owner !== document.body && !root.contains(owner) && !viaMenu) return;
    const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
    const target =
      tabs.find((tab) => tab.dataset.itemId === closing.neighbourId) ??
      tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    // A menu that is still showing keeps focus until it closes; its close handler then lands on
    // `settled` instead of the trigger (which may no longer exist).
    if (!inOpenMenu) target?.focus();
    settled.current = viaMenu ? (target ?? null) : null;
  }, [items, root]);

  /** `onCloseAutoFocus` of the Opened menu content. */
  const onCloseAutoFocus = (event: Event) => {
    const target = settled.current;
    settled.current = null;
    fromMenu.current = false;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  };

  return { onClose, onCloseFromMenu, onCloseAutoFocus };
}
