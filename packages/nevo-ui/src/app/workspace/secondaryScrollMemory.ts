import { createContext, useContext, useLayoutEffect, type RefObject } from 'react';

/**
 * Lightweight scroll memory for the Secondary's root tabs (secondary-navigation.md, "Root tabs").
 *
 * Only the active tab's screen is mounted, so its scroll viewport disappears when another tab is
 * shown. This module keeps the last scroll offset of each scroll container inside a tab panel,
 * keyed by `(tab id, stack entry instance)`, and puts it back when the same entry is shown again.
 * It is NOT keep-alive: nothing but numbers is retained. Selection, filters and drafts remain
 * product state (the Documents pattern); the workspace never snapshots them.
 *
 * A scroll container is identified by its ordinal among the panel's scrollable elements (those with
 * `overflow-y: auto | scroll | overlay`), so no product has to mark anything. This is best effort:
 * a panel whose set of scroll containers changes between visits restores whatever still matches.
 */

export interface SecondaryScrollMemory {
  /** Stores `top` for the `ordinal`-th scroll container of `key`'s panel. */
  remember: (key: string, ordinal: number, top: number) => void;
  /** The remembered offsets of `key`'s panel, by container ordinal. */
  recall: (key: string) => ReadonlyMap<number, number> | undefined;
  /** Drops one entry's offsets (the entry was popped, replaced or its tab closed). */
  forget: (tabId: string, entryKey: number) => void;
  /** Drops every offset of one tab. */
  forgetTab: (tabId: string) => void;
  /** Drops everything (scope change). */
  clear: () => void;
}

const SEPARATOR = '\u0000';

export function secondaryScrollKey(tabId: string, entryKey: number | string): string {
  return `${tabId}${SEPARATOR}${entryKey}`;
}

export function createSecondaryScrollMemory(): SecondaryScrollMemory {
  const offsets = new Map<string, Map<number, number>>();

  return {
    remember: (key, ordinal, top) => {
      const panel = offsets.get(key) ?? new Map<number, number>();
      if (top > 0) {
        panel.set(ordinal, top);
      } else {
        panel.delete(ordinal);
      }

      if (panel.size > 0) {
        offsets.set(key, panel);
      } else {
        offsets.delete(key);
      }
    },
    recall: (key) => offsets.get(key),
    forget: (tabId, entryKey) => {
      offsets.delete(secondaryScrollKey(tabId, entryKey));
    },
    forgetTab: (tabId) => {
      for (const key of [...offsets.keys()]) {
        if (key.startsWith(`${tabId}${SEPARATOR}`)) {
          offsets.delete(key);
        }
      }
    },
    clear: () => offsets.clear(),
  };
}

export const SecondaryScrollMemoryContext = createContext<SecondaryScrollMemory | null>(null);

function isScrollContainer(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const overflowY = getComputedStyle(element).overflowY;

  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

function scrollContainers(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll('*')).filter(isScrollContainer);
}

/** Frames the restore keeps retrying while the panel's content (async data) is still laying out. */
const RESTORE_FRAMES = 30;

/**
 * Records the scroll offsets of the scroll containers inside `panelRef` under `key` and restores
 * them once, when the panel mounts. Inert without a provider or a `key`. A user gesture while a
 * restore is still waiting for content cancels it, so it never fights the user.
 */
export function useSecondaryScrollMemory(
  panelRef: RefObject<HTMLElement | null>,
  key: string | undefined,
) {
  const memory = useContext(SecondaryScrollMemoryContext);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !memory || key === undefined) {
      return;
    }

    const ordinals = new WeakMap<Element, number>();
    let restoring = true;
    let frame = 0;

    const settle = () => {
      restoring = false;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (restoring || !(target instanceof HTMLElement) || !panel.contains(target)) {
        return;
      }

      let ordinal = ordinals.get(target);
      if (ordinal === undefined) {
        ordinal = scrollContainers(panel).indexOf(target);
        if (ordinal < 0) {
          return;
        }

        ordinals.set(target, ordinal);
      }

      memory.remember(key, ordinal, target.scrollTop);
    };

    const wanted = memory.recall(key);
    if (wanted && wanted.size > 0) {
      const pending = new Map(wanted);
      let frames = 0;
      const apply = () => {
        frame = 0;
        const containers = scrollContainers(panel);
        for (const [ordinal, top] of pending) {
          const container = containers[ordinal];
          if (container && container.scrollHeight - container.clientHeight >= top - 0.5) {
            container.scrollTop = top;
            pending.delete(ordinal);
          }
        }

        frames += 1;
        if (pending.size === 0 || frames >= RESTORE_FRAMES) {
          // Whatever could not be restored (content shorter than before) keeps the last offset
          // that was remembered; the first user scroll replaces it.
          restoring = false;

          return;
        }

        frame = requestAnimationFrame(apply);
      };

      apply();
    } else {
      restoring = false;
    }

    const cancelRestore = () => {
      if (restoring) {
        settle();
      }
    };

    panel.addEventListener('scroll', onScroll, true);
    panel.addEventListener('wheel', cancelRestore, { passive: true });
    panel.addEventListener('touchstart', cancelRestore, { passive: true });
    panel.addEventListener('keydown', cancelRestore);
    panel.addEventListener('pointerdown', cancelRestore);

    return () => {
      settle();
      panel.removeEventListener('scroll', onScroll, true);
      panel.removeEventListener('wheel', cancelRestore);
      panel.removeEventListener('touchstart', cancelRestore);
      panel.removeEventListener('keydown', cancelRestore);
      panel.removeEventListener('pointerdown', cancelRestore);
    };
  }, [memory, key, panelRef]);
}
