import { useEffect, useLayoutEffect, useRef } from 'react';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FocusAddress {
  readonly element: HTMLElement;
  /** `data-focus-key` of the closest keyed ancestor, else `section:<aria-labelledby>`. */
  readonly key: string;
  /** Position among the focusable elements inside the keyed container. */
  readonly index: number;
}

function container(element: HTMLElement): { key: string; root: HTMLElement } | null {
  const keyed = element.closest<HTMLElement>('[data-focus-key]');
  if (keyed?.dataset.focusKey) {
    return { key: keyed.dataset.focusKey, root: keyed };
  }

  const section = element.closest<HTMLElement>('section[aria-labelledby]');
  const label = section?.getAttribute('aria-labelledby');

  return section && label ? { key: `section:${label}`, root: section } : null;
}

function addressOf(element: HTMLElement): FocusAddress | null {
  const found = container(element);
  if (!found) {
    return null;
  }

  const focusables = [...found.root.querySelectorAll<HTMLElement>(focusableSelector)];
  const index = found.root === element ? -1 : focusables.indexOf(element);

  return { element, key: found.key, index };
}

function resolve(root: HTMLElement, address: FocusAddress): HTMLElement | null {
  const candidates = [
    ...root.querySelectorAll<HTMLElement>('[data-focus-key], section[aria-labelledby]'),
  ];
  const target = candidates.find((candidate) => container(candidate)?.key === address.key);
  if (!target) {
    return null;
  }

  if (address.index < 0) {
    return target;
  }

  const focusables = [...target.querySelectorAll<HTMLElement>(focusableSelector)];

  return focusables[address.index] ?? focusables[0] ?? null;
}

/**
 * Keeps keyboard focus when a layout change remounts the focused control.
 *
 * Specification Overview moves its context sections into or out of the context column when it
 * crosses its two-column width, which remounts them. If the control that had focus inside `root`
 * is detached by that crossing's own commit and focus fell to the document body, the same control
 * is focused again in the new arrangement, found by its closest `data-focus-key` (an opener row
 * keyed by its object) or else by its section and position.
 *
 * The record never outlives the user's own focus change: moving focus outside the Overview, a
 * pointer press inside it, or a blur to nothing while the control stays in the document (the user
 * clicked empty space) clears it, so a later crossing never pulls focus back. Focus that moved
 * elsewhere on purpose (into the Secondary, for example) is left alone.
 */
export function usePreserveFocusAcrossLayout(root: HTMLElement | null, layout: unknown) {
  const lastFocused = useRef<FocusAddress | null>(null);
  /** Whether the recorded control was in the document when the previous commit finished. */
  const connectedAtLastCommit = useRef(false);

  useEffect(() => {
    if (!root) {
      return undefined;
    }

    const onFocusIn = (event: FocusEvent) => {
      lastFocused.current = event.target instanceof HTMLElement ? addressOf(event.target) : null;
      connectedAtLastCommit.current = lastFocused.current !== null;
    };

    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node) {
        if (!root.contains(event.relatedTarget)) {
          lastFocused.current = null;
        }

        return;
      }

      // A blur to nothing: removal by a layout change keeps the record (that commit restores it
      // synchronously); a control still in the document was left by the user, so forget it. The
      // window losing focus keeps the control active and is not a user choice either.
      const left = lastFocused.current;
      queueMicrotask(() => {
        if (
          left &&
          lastFocused.current === left &&
          left.element.isConnected &&
          document.activeElement !== left.element
        ) {
          lastFocused.current = null;
        }
      });
    };

    const onPointerDown = () => {
      lastFocused.current = null;
    };

    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [root]);

  useLayoutEffect(() => {
    const address = lastFocused.current;
    const active = document.activeElement;
    if (
      !root ||
      !address ||
      !connectedAtLastCommit.current ||
      address.element.isConnected ||
      (active !== null && active !== document.body)
    ) {
      return;
    }

    const target = resolve(root, address);
    if (target) {
      target.focus({ preventScroll: true });
    }
  }, [root, layout]);

  // Runs after the restore above on every commit: a control detached by some other commit (a data
  // refresh) is not restored by a later crossing.
  useLayoutEffect(() => {
    connectedAtLastCommit.current = lastFocused.current?.element.isConnected ?? false;
  });
}
