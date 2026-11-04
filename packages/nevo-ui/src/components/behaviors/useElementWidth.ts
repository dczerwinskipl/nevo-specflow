import { useLayoutEffect, useState } from 'react';

/**
 * Coalesces a `ResizeObserver` callback through `requestAnimationFrame`: a burst of notifications
 * (every pixel crossed during a continuous drag-resize fires one) collapses into at most one
 * `measure()` call per animation frame, always reading the *latest* layout at flush time. Without
 * this, each notification commits its own React state update synchronously; cascading through the
 * whole shell/workspace tree (itself full of further `ResizeObserver`-driven measurements —
 * `AppWorkspace`, `WorkspaceHeader`, `ItemTabs`, `ScrollArea`), that per-notification commit cost
 * compounds faster than a real drag re-fires the observer, so the committed width falls further and
 * further behind the actual (already-settled) window size — visibly "stuck" at a stale, narrower-
 * or-wider-than-current layout for as long as it takes the backlog to drain. Coalescing bounds the
 * commit rate to one per frame regardless of notification rate, so the rendered layout can never
 * fall more than one frame behind the real size.
 *
 * Returns the cleanup. Does nothing (and returns `undefined`) where `ResizeObserver` is missing.
 */
export function observeWidthCoalesced(element: Element, measure: () => void) {
  if (typeof ResizeObserver === 'undefined') {
    return undefined;
  }

  let frame: number | null = null;
  const scheduleMeasure = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }

    frame = requestAnimationFrame(() => {
      frame = null;
      measure();
    });
  };

  const observer = new ResizeObserver(scheduleMeasure);
  observer.observe(element);

  return () => {
    observer.disconnect();
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
  };
}

/**
 * Measures an element's rendered width (`ResizeObserver`, coalesced to one commit per frame), for
 * components whose presentation — not only their CSS — depends on the space they get (`AppShell`'s
 * persistent/drawer mode, `ItemTabs`' strip/switcher, `Breadcrumbs`' collapse). `width` is
 * `undefined` until the element is attached and measured (and during SSR).
 * Attach with the returned `setElement` callback ref.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    if (!element) {
      return undefined;
    }

    const update = () => setWidth(element.getBoundingClientRect().width);
    update();

    return observeWidthCoalesced(element, update);
  }, [element]);

  return { width, element, setElement };
}
