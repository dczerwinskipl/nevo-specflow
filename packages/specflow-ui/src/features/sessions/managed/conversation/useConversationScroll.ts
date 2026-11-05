import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLayoutInducedScroll } from '../useLayoutInducedScroll';
import {
  anchoredScrollTop,
  firstBelow,
  followingAfterScroll,
  maxScrollTop,
  type ReadingAnchor,
} from './scrollPosition';

/**
 * How long scrolling must pause before the settled "away from the latest" verdict is published
 * (it drives the "Jump to latest" pill and the feed's window keeping): committing it on every event
 * would make the pill flicker as hand jitter crosses the threshold. Only the published verdict
 * waits; the scroll position itself is decided on every event.
 */
const AWAY_SETTLE_MS = 100;

export interface ConversationScroll {
  /**
   * Re-applies the position after a change the scroller does not report itself: a commit that
   * changed what the conversation renders, a message whose text grew, a re-measured composer.
   * Stable for the scroller's lifetime.
   */
  layoutChanged: () => void;
  /** The reader asked for the latest messages: follow them again from now on. */
  followLatest: () => void;
}

function readAnchor(node: HTMLElement): ReadingAnchor | undefined {
  const entries = node.querySelectorAll<HTMLElement>('[data-entry-id]');
  const top = node.getBoundingClientRect().top;
  const index = firstBelow(
    entries.length,
    (at) => entries[at]!.getBoundingClientRect().bottom,
    top,
  );
  const entry = entries[index];
  if (!entry?.dataset.entryId) {
    return undefined;
  }

  return {
    id: entry.dataset.entryId,
    contentTop: entry.getBoundingClientRect().top - top + node.scrollTop,
    scrollTop: node.scrollTop,
  };
}

function contentTopOf(node: HTMLElement, id: string) {
  const entry = node.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`);

  return entry
    ? entry.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop
    : undefined;
}

/**
 * Where the reader is: following the latest message, or reading the anchored entry. Owned by the
 * Session screen rather than the mounted conversation view, so it survives the view being
 * re-parented (and remounted) when the layout switches between split and stacked.
 */
export interface ConversationScrollPosition {
  following: boolean;
  anchor?: { scroller: HTMLElement; at: ReadingAnchor };
}

export const createConversationScrollPosition = (): ConversationScrollPosition => ({
  following: true,
});

function record(position: ConversationScrollPosition, node: HTMLElement) {
  const at = readAnchor(node);
  if (at) {
    position.anchor = { scroller: node, at };
  } else {
    delete position.anchor;
  }
}

/**
 * The single owner of the conversation's scroll position (`scrollPosition.ts`): whether the reader
 * follows the latest message or reads above it, the entry they are reading, and every `scrollTop`
 * write that follows from that. Nothing else writes `scrollTop`.
 *
 * The mode changes only on a `scroll` event (`followingAfterScroll`: landing at the latest message
 * follows it, the reader moving the view up away from it reads) or on `followLatest`, never on the debounced
 * verdict the feed holds, so a change landing in the same instant as the reader's gesture is
 * already decided by it. Every other change — new or grown messages, older history
 * prepended, content resizing by itself (a late image), the composer, the scroller or the viewport
 * resizing, the layout moving the conversation to another scroll owner — goes through one `apply`:
 * following pins to the bottom, reading moves the anchored entry back to where it was read. The
 * browser's own scroll anchoring is switched off on the scroller while the conversation owns it, so
 * the browser and this policy never both correct the same change (and the behaviour does not depend
 * on a browser supporting it).
 */
export function useConversationScroll(
  position: ConversationScrollPosition,
  scroller: HTMLElement | null,
  /** The element holding the conversation's entries, inside `scroller`. */
  content: HTMLElement | null,
  onAwaySettled: (away: boolean) => void,
): ConversationScroll {
  const isLayoutInduced = useLayoutInducedScroll(scroller);
  const awaySettled = useRef(onAwaySettled);
  useLayoutEffect(() => {
    awaySettled.current = onAwaySettled;
  });

  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The `scrollTop` the policy last knew on its scroller: the one the last handled `scroll` event
  // saw, or the one the policy itself last wrote. A move up from it that the policy did not make is
  // the reader's, unless the layout made it (`followingAfterScroll`).
  const known = useRef<{ node: HTMLElement; top: number } | undefined>(undefined);

  // Decides the mode from where the view is now (the reader's gesture, or the layout) and records
  // the entry being read; the settled "away" verdict is published once scrolling pauses. A scroll
  // event that finds the view where the policy last knew it reports no reading of its own — it is
  // one the browser queued for an earlier position, delivered after the content changed again (a
  // late image) but before that change was re-applied — so the entry being read stays as recorded,
  // for `apply` to keep in place, instead of being re-read from content that just moved.
  const observe = useCallback(
    (node: HTMLElement) => {
      const previous = known.current?.node === node ? known.current.top : node.scrollTop;
      position.following = followingAfterScroll(
        position.following,
        node,
        previous,
        isLayoutInduced(),
      );
      known.current = { node, top: node.scrollTop };
      if (Math.abs(node.scrollTop - previous) >= 0.5) {
        record(position, node);
      }

      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(
        () => awaySettled.current(!position.following),
        AWAY_SETTLE_MS,
      );
    },
    // `isLayoutInduced` is recreated every render over the same scroller-bound refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, scroller],
  );

  const apply = useCallback(() => {
    const node = scroller;
    if (!node) {
      return;
    }

    // The view already moved up, but its `scroll` event has not been handled yet (an asynchronous
    // wheel or touch scroll landing in the same frame as this change): decide that move first, so
    // pinning to the bottom never undoes a reader's gesture.
    if (
      position.following &&
      known.current?.node === node &&
      node.scrollTop < known.current.top - 0.5
    ) {
      observe(node);
    }

    if (position.following) {
      if (node.scrollTop < maxScrollTop(node) - 0.5) {
        node.scrollTop = node.scrollHeight;
      }

      known.current = { node, top: node.scrollTop };

      return;
    }

    const previous = position.anchor;
    const contentTop = previous && contentTopOf(node, previous.at.id);
    if (previous && contentTop !== undefined) {
      const target = anchoredScrollTop(
        previous.at,
        { contentTop, geometry: node },
        previous.scroller === node,
      );
      if (Math.abs(target - node.scrollTop) >= 1) {
        node.scrollTop = target;
      }
    }

    known.current = { node, top: node.scrollTop };
    record(position, node);
  }, [observe, position, scroller]);

  // A (new) scroll owner: switch off native anchoring, and take over the position — the bottom
  // when following, the entry being read when the layout just moved the conversation here.
  useLayoutEffect(() => {
    const node = scroller;
    if (!node) {
      return undefined;
    }

    const previousAnchoring = node.style.overflowAnchor;
    node.style.overflowAnchor = 'none';
    apply();

    return () => {
      node.style.overflowAnchor = previousAnchoring;
    };
  }, [apply, scroller]);

  useEffect(() => {
    const node = scroller;
    if (!node) {
      return undefined;
    }

    const handleScroll = () => observe(node);
    node.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      node.removeEventListener('scroll', handleScroll);
      clearTimeout(settleTimer.current);
    };
  }, [observe, scroller]);

  // Two kinds of change reach neither a scroll event nor a commit of this screen: the scroller's
  // own box changing (the viewport, the Secondary splitter, a soft keyboard re-wrapping the
  // conversation), and the content growing or shrinking on its own after it rendered (an image
  // in a message finishing loading, a font swapping in, a code block's own layout settling).
  // Native anchoring is off, so the position must follow both here.
  useLayoutEffect(() => {
    if (!scroller || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => apply());
    observer.observe(scroller);
    if (content) {
      observer.observe(content);
    }

    return () => observer.disconnect();
  }, [apply, content, scroller]);

  const followLatest = useCallback(() => {
    position.following = true;
    delete position.anchor;
    apply();
  }, [apply, position]);

  return { layoutChanged: apply, followLatest };
}
