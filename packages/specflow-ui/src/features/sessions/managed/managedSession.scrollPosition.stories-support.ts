import { expect, waitFor, within } from 'storybook/test';

/**
 * Geometry helpers the scroll-position plays share (`ManagedSession.scrollPosition*.stories.tsx`):
 * the conversation's scroll owner, the reader's gesture, and the "still reading where they were"
 * and "still following" assertions.
 */

export const STACKED = { width: 390, height: 844 } as const;
export const SPLIT = { width: 1280, height: 844 } as const;

export const nextFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

export function scrollerOf(canvasElement: HTMLElement) {
  const node = canvasElement.querySelector<HTMLElement>('[data-session-scroller]');
  if (!node) {
    throw new Error('Expected a conversation scroll owner (data-session-scroller).');
  }

  return node;
}

export const distanceFromBottom = (node: HTMLElement) =>
  Math.round(node.scrollHeight - node.clientHeight - node.scrollTop);

export const latestPill = (canvasElement: HTMLElement) =>
  within(canvasElement).queryByRole('button', { name: 'Wróć do najnowszych wiadomości' });

/** The reader's gesture: moves the scroll owner and delivers its `scroll` event in this same task. */
export function readerScrollsTo(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event('scroll'));
}

/** The first entry still visible below the scroller's top edge, and its offset from that edge. */
export function firstVisibleEntry(scroller: HTMLElement) {
  const top = scroller.getBoundingClientRect().top;
  const entry = [...scroller.querySelectorAll<HTMLElement>('[data-entry-id]')].find(
    (element) => element.getBoundingClientRect().bottom > top + 1,
  );
  if (!entry?.dataset.entryId) {
    throw new Error('Expected a visible conversation entry.');
  }

  return { id: entry.dataset.entryId, offset: entry.getBoundingClientRect().top - top };
}

export function entryOffset(scroller: HTMLElement, id: string) {
  const entry = scroller.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`);
  if (!entry) {
    throw new Error(`Entry ${id} is no longer rendered.`);
  }

  return entry.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}

/** The reader still sees the entry they were reading, where they were reading it. */
export async function expectReadingPosition(
  scroller: HTMLElement,
  anchor: { id: string; offset: number },
  label: string,
) {
  await expect(
    Math.round(entryOffset(scroller, anchor.id)),
    `${label}: "${anchor.id}" stays where the reader was reading it`,
  ).toBeGreaterThanOrEqual(Math.round(anchor.offset) - 2);
  await expect(
    Math.round(entryOffset(scroller, anchor.id)),
    `${label}: "${anchor.id}" stays where the reader was reading it`,
  ).toBeLessThanOrEqual(Math.round(anchor.offset) + 2);
  await expect(
    distanceFromBottom(scroller),
    `${label}: not pulled back to the latest message`,
  ).toBeGreaterThan(200);
}

/**
 * Waits until the scroll owner's box has not changed for longer than the window in which a scroll
 * no reader input claims is attributed to the layout (`useLayoutInducedScroll`'s 200 ms): the plays'
 * synthetic gestures carry no wheel or touch input.
 */
export async function scrollOwnerSettled(scroller: HTMLElement, quietMs = 250) {
  let changedAt = performance.now();
  const mark = () => {
    changedAt = performance.now();
  };

  const observer = new ResizeObserver(mark);
  observer.observe(scroller);
  window.addEventListener('resize', mark);
  try {
    await waitFor(
      () => {
        if (performance.now() - changedAt < quietMs) {
          throw new Error('The conversation scroller is still resizing');
        }
      },
      { timeout: 5000 },
    );
  } finally {
    observer.disconnect();
    window.removeEventListener('resize', mark);
  }
}

/** A long conversation on screen, overflowing its scroller and following the latest message. */
export async function followingLongConversation(
  canvasElement: HTMLElement,
  lastText: string | RegExp,
) {
  await within(canvasElement).findByText(lastText, undefined, { timeout: 5000 });
  const scroller = await waitFor(() => {
    const node = scrollerOf(canvasElement);
    if (!(node.scrollHeight - node.clientHeight > 1200)) {
      throw new Error('Expected the conversation to overflow its scroller.');
    }

    return node;
  });
  await scrollOwnerSettled(scroller);
  await waitFor(async () =>
    expect(distanceFromBottom(scroller), 'following the latest message').toBeLessThanOrEqual(2),
  );

  return scroller;
}

/** Waits out the pill debounce (a condition, not a sleep): the pill is the settled "away" verdict. */
export async function awaySettled(canvasElement: HTMLElement) {
  await waitFor(async () => expect(latestPill(canvasElement)).not.toBeNull());
}
