import { useLayoutEffect, useState } from 'react';

/**
 * Measures an element's rendered width (`ResizeObserver`), for components whose presentation —
 * not only their CSS — depends on the space they get (`ItemTabs`' strip/switcher, `Breadcrumbs`'
 * collapse). `width` is `undefined` until the element is attached and measured (and during SSR).
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
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return { width, element, setElement };
}
