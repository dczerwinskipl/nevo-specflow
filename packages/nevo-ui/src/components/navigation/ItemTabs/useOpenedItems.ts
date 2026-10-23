import { useCallback, useState } from 'react';

export interface OpenedItem {
  /** Stable identity. Opening an item whose id is already open activates it instead. */
  id: string;
}

export interface UseOpenedItemsOptions<T extends OpenedItem> {
  /** Items open on first render (and again whenever `scope` changes). */
  initialItems?: readonly T[];
  /** Active item on first render (and again whenever `scope` changes). Defaults to the first item; `null` means none. */
  initialActiveId?: string | null;
  /**
   * Identity of the surface the items belong to (workspace, project, session). Changing it resets
   * the state to the initial values so one scope never shows another scope's items.
   */
  scope?: string | number | null;
  /**
   * Guard consulted by `requestClose`. Return `false` (or resolve `false`) to keep the item open,
   * for example while the host asks about unsaved changes.
   */
  canClose?: (id: string) => boolean | Promise<boolean>;
}

export interface OpenedItemsState<T extends OpenedItem> {
  items: readonly T[];
  activeId: string | null;
  /**
   * Opens the item, or activates it when its id is already open. Never duplicates. An existing
   * item keeps its stored value: its data is not refreshed from the argument.
   */
  open: (item: T) => void;
  /** Activates an open item. Unknown ids are ignored. */
  activate: (id: string) => void;
  /**
   * Closes without asking. Closing the active item activates its right neighbour, else the left
   * one; closing the last item leaves `activeId` null.
   */
  close: (id: string) => void;
  /** Closes after `canClose` agrees. Resolves to whether the item was closed. */
  requestClose: (id: string) => Promise<boolean>;
  /** Closes everything without asking. */
  closeAll: () => void;
}

interface Snapshot<T extends OpenedItem> {
  scope: string | number | null;
  items: readonly T[];
  activeId: string | null;
}

function initialSnapshot<T extends OpenedItem>(
  scope: string | number | null,
  items: readonly T[],
  activeId: string | null | undefined,
): Snapshot<T> {
  // `undefined` means "first item"; an explicit `null` means "none active".
  const first = items[0]?.id ?? null;
  const known = activeId != null && items.some((item) => item.id === activeId);
  return { scope, items, activeId: activeId === null ? null : known ? activeId : first };
}

function openIn<T extends OpenedItem>(snapshot: Snapshot<T>, item: T): Snapshot<T> {
  const exists = snapshot.items.some((candidate) => candidate.id === item.id);
  return {
    ...snapshot,
    items: exists ? snapshot.items : [...snapshot.items, item],
    activeId: item.id,
  };
}

function closeIn<T extends OpenedItem>(snapshot: Snapshot<T>, id: string): Snapshot<T> {
  const index = snapshot.items.findIndex((item) => item.id === id);
  if (index < 0) return snapshot;
  const items = snapshot.items.filter((item) => item.id !== id);
  const activeId =
    snapshot.activeId === id
      ? (items[Math.min(index, items.length - 1)]?.id ?? null)
      : snapshot.activeId;
  return { ...snapshot, items, activeId };
}

/**
 * Headless state for a set of opened items and the active one. Product-agnostic: it knows ids only.
 * Pair it with `ItemTabs` (items need `id`; display fields are the host's mapping).
 */
export function useOpenedItems<T extends OpenedItem>({
  initialItems = [],
  initialActiveId,
  scope = null,
  canClose,
}: UseOpenedItemsOptions<T> = {}): OpenedItemsState<T> {
  const [stored, setStored] = useState(() => initialSnapshot(scope, initialItems, initialActiveId));

  // A new scope starts from the initial values. Adjusting state while rendering (instead of in an
  // effect) avoids committing one frame of the previous scope's items.
  let current = stored;
  if (stored.scope !== scope) {
    current = initialSnapshot(scope, initialItems, initialActiveId);
    setStored(current);
  }

  // Updates only apply to the scope they were started in, so a late async close cannot touch a
  // newer scope.
  const update = useCallback(
    (apply: (snapshot: Snapshot<T>) => Snapshot<T>) =>
      setStored((previous) => (previous.scope === scope ? apply(previous) : previous)),
    [scope],
  );

  const open = useCallback((item: T) => update((snapshot) => openIn(snapshot, item)), [update]);
  const activate = useCallback(
    (id: string) =>
      update((snapshot) =>
        snapshot.items.some((item) => item.id === id) ? { ...snapshot, activeId: id } : snapshot,
      ),
    [update],
  );
  const close = useCallback((id: string) => update((snapshot) => closeIn(snapshot, id)), [update]);
  const closeAll = useCallback(
    () => update((snapshot) => ({ ...snapshot, items: [], activeId: null })),
    [update],
  );
  const requestClose = async (id: string) => {
    const allowed = canClose ? await canClose(id) : true;
    if (allowed) close(id);
    return allowed;
  };

  return {
    items: current.items,
    activeId: current.activeId,
    open,
    activate,
    close,
    requestClose,
    closeAll,
  };
}
