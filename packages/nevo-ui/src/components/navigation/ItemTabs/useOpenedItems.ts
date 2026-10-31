import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface OpenedItem {
  /** Stable identity. Opening an item whose id is already open activates it instead. */
  id: string;
  /**
   * Whether the item can be closed. Defaults to `true` when omitted. A `false` item is skipped by
   * `close`, `requestClose` (which resolves `false` without consulting `canClose` — there is
   * nothing to guard) and `closeAll`.
   */
  closable?: boolean;
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
  /**
   * Closes after `canClose` agrees. Resolves `true` only when this call actually closed the item:
   * `false` when the guard refused, the item is not open (any more), the scope changed or the host
   * unmounted while waiting. Concurrent requests for the same id share one guard call and result.
   * A guard that throws or rejects is NOT swallowed: the returned promise rejects with the same
   * error, the item stays open and the in-flight state is cleaned up, so the next request works.
   * Hosts must handle the rejection (treat it as a refusal and tell the user).
   */
  requestClose: (id: string) => Promise<boolean>;
  /** Closes everything without asking. */
  closeAll: () => void;
  /**
   * Gives an open item a new identity in place (for example after the host renamed its resource):
   * same position, still active when it was active. Ignored when `id` is not open; when `item.id`
   * is already open elsewhere, the old entry is dropped instead of duplicating it.
   */
  replace: (id: string, item: T) => void;
}

interface Snapshot<T extends OpenedItem> {
  scope: string | number | null;
  /** Identifies one session of the state. Bumped on every scope reset, so A -> B -> A differs. */
  generation: number;
  items: readonly T[];
  activeId: string | null;
}

function initialSnapshot<T extends OpenedItem>(
  scope: string | number | null,
  generation: number,
  items: readonly T[],
  activeId: string | null | undefined,
): Snapshot<T> {
  // `undefined` means "first item"; an explicit `null` means "none active".
  const first = items[0]?.id ?? null;
  const known = activeId != null && items.some((item) => item.id === activeId);

  return {
    scope,
    generation,
    items,
    activeId: activeId === null ? null : known ? activeId : first,
  };
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
  if (index < 0 || snapshot.items[index]?.closable === false) {
    return snapshot;
  }

  const items = snapshot.items.filter((item) => item.id !== id);
  const activeId =
    snapshot.activeId === id
      ? (items[Math.min(index, items.length - 1)]?.id ?? null)
      : snapshot.activeId;

  return { ...snapshot, items, activeId };
}

function replaceIn<T extends OpenedItem>(snapshot: Snapshot<T>, id: string, item: T): Snapshot<T> {
  const index = snapshot.items.findIndex((candidate) => candidate.id === id);
  if (index < 0 || id === item.id) {
    return snapshot;
  }

  const duplicate = snapshot.items.some((candidate) => candidate.id === item.id);
  const items = duplicate
    ? snapshot.items.filter((candidate) => candidate.id !== id)
    : snapshot.items.map((candidate, at) => (at === index ? item : candidate));

  return { ...snapshot, items, activeId: snapshot.activeId === id ? item.id : snapshot.activeId };
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
  const [stored, setStored] = useState(() =>
    initialSnapshot(scope, 0, initialItems, initialActiveId),
  );

  // A new scope starts a new generation from the initial values. Adjusting state while rendering
  // (instead of in an effect) avoids committing one frame of the previous scope's items.
  let current = stored;
  if (stored.scope !== scope) {
    current = initialSnapshot(scope, stored.generation + 1, initialItems, initialActiveId);
    setStored(current);
  }

  const { generation } = current;

  // Updates only apply to the generation they were started in, so a late async close cannot touch
  // a newer session, even one that has the same scope value again (A -> B -> A).
  const update = useCallback(
    (apply: (snapshot: Snapshot<T>) => Snapshot<T>) =>
      setStored((previous) => (previous.generation === generation ? apply(previous) : previous)),
    [generation],
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
    () =>
      update((snapshot) => {
        const items = snapshot.items.filter((item) => item.closable === false);
        const activeId = items.some((item) => item.id === snapshot.activeId)
          ? snapshot.activeId
          : (items[0]?.id ?? null);

        return { ...snapshot, items, activeId };
      }),
    [update],
  );
  const replace = useCallback(
    (id: string, item: T) => update((snapshot) => replaceIn(snapshot, id, item)),
    [update],
  );

  // Latest committed values for the async close, which outlives the render that started it.
  const latest = useRef({ snapshot: current, canClose });
  useLayoutEffect(() => {
    latest.current = { snapshot: current, canClose };
  });
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);
  const inFlight = useRef(new Map<string, Promise<boolean>>());

  const requestClose = (id: string) => {
    const key = `${generation}:${id}`;
    const running = inFlight.current.get(key);
    if (running) {
      return running;
    }

    // Non-closable items have nothing to guard: refuse unconditionally, without calling `canClose`.
    const target = current.items.find((item) => item.id === id);
    if (target && target.closable === false) {
      return Promise.resolve(false);
    }

    const run = (async () => {
      const guard = latest.current.canClose;
      const allowed = guard ? await guard(id) : true;
      const { snapshot } = latest.current;
      if (
        !allowed ||
        !mounted.current ||
        snapshot.generation !== generation ||
        !snapshot.items.some((item) => item.id === id)
      ) {
        return false;
      }

      close(id);

      return true;
    })().finally(() => inFlight.current.delete(key));
    inFlight.current.set(key, run);

    return run;
  };

  return {
    items: current.items,
    activeId: current.activeId,
    open,
    activate,
    close,
    requestClose,
    closeAll,
    replace,
  };
}
