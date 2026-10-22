import { descriptionScrollOwner } from './DocumentDescription';

const userInputEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Restores a remembered scroll position once the page can actually hold it.
 *
 * A page that is remounted by the workspace host is not necessarily laid out yet (a hidden or
 * animating surface has no scroll height, and an ancestor scroller may not be resolvable), so a
 * single assignment clamps to 0 and is lost. This keeps retrying on every layout change of the
 * node or any ancestor and stops as soon as the position is applied, the reader scrolls
 * themselves, or the returned cleanup runs. `onSettled` fires when it stops for the first two reasons.
 */
export function restoreScrollPosition(
  node: HTMLElement,
  readTarget: () => number,
  onSettled?: () => void,
): () => void {
  const view = node.ownerDocument.defaultView ?? window;
  const scrollingElement = node.ownerDocument.scrollingElement;
  let frame = 0;
  const observer = new view.ResizeObserver(() => attempt());
  let done = false;

  const finish = () => {
    done = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    for (const type of userInputEvents) node.ownerDocument.removeEventListener(type, settle, true);
  };
  const settle = () => {
    if (done) return;
    finish();
    onSettled?.();
  };
  const attempt = () => {
    if (done) return;
    const target = readTarget();
    const owner = descriptionScrollOwner(node);
    // Without a scrollable ancestor the page is not laid out yet; wait for the next layout change.
    if (owner === scrollingElement && target > 0) return;
    owner.scrollTop = target;
    if (Math.abs(owner.scrollTop - target) > 1) return;
    settle();
  };

  for (const type of userInputEvents)
    node.ownerDocument.addEventListener(type, settle, { capture: true, passive: true });
  for (let element: HTMLElement | null = node; element; element = element.parentElement)
    observer.observe(element);
  frame = requestAnimationFrame(attempt);
  return finish;
}
