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
 * The mode changes only on a `scroll` event (`followingAfterScroll`) or on `followLatest`, never on
 * the debounced verdict the feed holds, so a change landing in the same instant as the reader's
 * gesture is already decided by it. Every other change — new or grown messages, older history
 * prepended, the composer, the scroller or the viewport resizing, the layout moving the
 * conversation to another scroll owner — goes through one `apply`: following pins to the bottom,
 * reading moves the anchored entry back to where it was read. The browser's own scroll anchoring is
 * switched off on the scroller while the conversation owns it, so the browser and this policy never
 * both correct the same change (and the behaviour does not depend on a browser supporting it).
 */
export function useConversationScroll(
  position: ConversationScrollPosition,
  scroller: HTMLElement | null,
  onAwaySettled: (away: boolean) => void,
): ConversationScroll {
  const isLayoutInduced = useLayoutInducedScroll(scroller);
  const awaySettled = useRef(onAwaySettled);
  useLayoutEffect(() => {
    awaySettled.current = onAwaySettled;
  });

  const apply = useCallback(() => {
    const node = scroller;
    if (!node) {
      return;
    }

    if (position.following) {
      if (node.scrollTop < maxScrollTop(node) - 0.5) {
        node.scrollTop = node.scrollHeight;
      }

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

    record(position, node);
  }, [position, scroller]);

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

    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      position.following = followingAfterScroll(position.following, node, isLayoutInduced());
      record(position, node);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => awaySettled.current(!position.following), AWAY_SETTLE_MS);
    };

    node.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      node.removeEventListener('scroll', handleScroll);
      clearTimeout(settleTimer);
    };
    // `isLayoutInduced` is recreated every render over the same scroller-bound refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, scroller]);

  // The scroller's own box changing (the viewport, the Secondary splitter, a soft keyboard)
  // re-wraps the conversation without any scroll event or commit of this screen.
  useLayoutEffect(() => {
    if (!scroller || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => apply());
    observer.observe(scroller);

    return () => observer.disconnect();
  }, [apply, scroller]);

  const followLatest = useCallback(() => {
    position.following = true;
    delete position.anchor;
    apply();
  }, [apply, position]);

  return { layoutChanged: apply, followLatest };
}
