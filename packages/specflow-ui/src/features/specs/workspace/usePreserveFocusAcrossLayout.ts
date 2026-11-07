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
 * is detached by such a change and focus fell to the document body, the same control is focused
 * again in the new arrangement, found by its closest `data-focus-key` (an opener row keyed by its
 * object) or else by its section and position. Focus that moved elsewhere on purpose (into the
 * Secondary, for example) is left alone.
 */
export function usePreserveFocusAcrossLayout(root: HTMLElement | null, layout: unknown) {
  const lastFocused = useRef<FocusAddress | null>(null);

  useEffect(() => {
    if (!root) {
      return undefined;
    }

    const onFocusIn = (event: FocusEvent) => {
      lastFocused.current = event.target instanceof HTMLElement ? addressOf(event.target) : null;
    };

    const onFocusOut = (event: FocusEvent) => {
      // Moving to another control outside the Overview is deliberate; a blur to nothing (the
      // focused control was removed, or the window lost focus) keeps the record.
      if (event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) {
        lastFocused.current = null;
      }
    };

    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);

    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    };
  }, [root]);

  useLayoutEffect(() => {
    const address = lastFocused.current;
    const active = document.activeElement;
    if (
      !root ||
      !address ||
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
}
