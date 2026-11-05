import { describe, expect, it } from 'vitest';
import {
  FOLLOW_THRESHOLD_PX,
  anchoredScrollTop,
  firstBelow,
  followingAfterScroll,
  isAtLatest,
} from './scrollPosition';

const geometry = (scrollTop: number, scrollHeight = 3000, clientHeight = 800) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe('conversation scroll position policy', () => {
  it('counts the last few pixels above the bottom as following the latest message', () => {
    expect(isAtLatest(geometry(2200))).toBe(true);
    expect(isAtLatest(geometry(2200 - FOLLOW_THRESHOLD_PX))).toBe(true);
    expect(isAtLatest(geometry(2200 - FOLLOW_THRESHOLD_PX - 1))).toBe(false);
    // A conversation that does not overflow is always at its latest message.
    expect(isAtLatest(geometry(0, 500))).toBe(true);
  });

  it('starts reading as soon as the reader scrolls up away, and follows again at the bottom', () => {
    expect(followingAfterScroll(true, geometry(1500), 2200, false)).toBe(false);
    expect(followingAfterScroll(false, geometry(2200), 1500, false)).toBe(true);
    expect(followingAfterScroll(false, geometry(1500), 1400, false)).toBe(false);
    expect(followingAfterScroll(false, geometry(1400), 1500, false)).toBe(false);
  });

  it('never starts reading from a move up the layout caused, but may resume following from one', () => {
    expect(followingAfterScroll(true, geometry(1500), 2200, true)).toBe(true);
    expect(followingAfterScroll(false, geometry(1500), 2200, true)).toBe(false);
    expect(followingAfterScroll(false, geometry(2200), 1500, true)).toBe(true);
  });

  it('never starts reading from a scroll that did not move the view up', () => {
    // The content re-wrapped taller under an unchanged scrollTop before the pin (a resize).
    expect(followingAfterScroll(true, geometry(1500, 3600), 1500, false)).toBe(true);
    // A pin or another write moving the view down, not yet at the bottom.
    expect(followingAfterScroll(true, geometry(1800), 1500, false)).toBe(true);
    // Sub-pixel layout rounding is not a reader's gesture.
    expect(followingAfterScroll(true, geometry(1500.2, 3600), 1500.5, false)).toBe(true);
  });

  it('on the same scroller compensates only the entry moving, keeping the reader’s own scrolling', () => {
    const anchor = { id: 'e', contentTop: 1000, scrollTop: 900 };
    // 300px of older history landed above the entry; the reader had scrolled 20px further since.
    expect(
      anchoredScrollTop(anchor, { contentTop: 1300, geometry: geometry(920, 3300) }, true),
    ).toBe(1220);
    // Content below the entry changed: nothing to compensate.
    expect(
      anchoredScrollTop(anchor, { contentTop: 1000, geometry: geometry(900, 3500) }, true),
    ).toBe(900);
  });

  it('on a new scroller puts the entry back at the same distance from the top edge', () => {
    const anchor = { id: 'e', contentTop: 1000, scrollTop: 900 };
    expect(
      anchoredScrollTop(anchor, { contentTop: 2400, geometry: geometry(0, 5000) }, false),
    ).toBe(2300);
  });

  it('keeps the target inside the scrollable range', () => {
    const anchor = { id: 'e', contentTop: 1000, scrollTop: 900 };
    expect(anchoredScrollTop(anchor, { contentTop: 50, geometry: geometry(0) }, false)).toBe(0);
    expect(
      anchoredScrollTop(anchor, { contentTop: 2900, geometry: geometry(0, 3000) }, false),
    ).toBe(2200);
  });

  it('finds the first item whose bottom edge is below the top edge', () => {
    const bottoms = [100, 200, 300, 400];
    expect(firstBelow(bottoms.length, (index) => bottoms[index]!, 0)).toBe(0);
    expect(firstBelow(bottoms.length, (index) => bottoms[index]!, 200)).toBe(2);
    expect(firstBelow(bottoms.length, (index) => bottoms[index]!, 250)).toBe(2);
    expect(firstBelow(bottoms.length, (index) => bottoms[index]!, 400)).toBe(4);
    expect(firstBelow(0, () => 0, 0)).toBe(0);
  });
});
