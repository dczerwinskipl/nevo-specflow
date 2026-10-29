// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESTORE_MAX_FRAMES, restoreWhileIdle, sameAnchor } from './documentScrollAnchor';

let queue: FrameRequestCallback[] = [];
const frame = () => {
  const due = queue;
  queue = [];
  for (const callback of due) {
    callback(0);
  }
};

beforeEach(() => {
  queue = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => queue.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {
    queue = [];
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('restoring a reading position', () => {
  it('re-applies until the layout holds the target on two frames in a row', () => {
    const scroller = document.createElement('div');
    // The editor needs four measure passes before the position stays where it was put.
    let applied = 0;
    const apply = vi.fn(() => (applied += 1));
    restoreWhileIdle(scroller, apply, () => applied >= 4);
    for (let i = 0; i < 20; i++) {
      frame();
    }

    expect(apply).toHaveBeenCalledTimes(5);
  });

  it('stops at the first scroll of the reader', () => {
    const scroller = document.createElement('div');
    const apply = vi.fn();
    restoreWhileIdle(scroller, apply, () => false);
    frame();
    scroller.dispatchEvent(new Event('wheel'));
    for (let i = 0; i < 5; i++) {
      frame();
    }

    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('gives up on a position the view cannot reach', () => {
    const scroller = document.createElement('div');
    const apply = vi.fn();
    restoreWhileIdle(scroller, apply, () => false);
    for (let i = 0; i < RESTORE_MAX_FRAMES * 2; i++) {
      frame();
    }

    expect(apply).toHaveBeenCalledTimes(RESTORE_MAX_FRAMES);
  });

  it('compares anchors by line and offset, or by ratio without a line', () => {
    expect(
      sameAnchor({ line: 7, offset: 0.3, ratio: 0 }, { line: 7, offset: 0.32, ratio: 1 }),
    ).toBe(true);
    expect(sameAnchor({ line: 6, offset: 0.3, ratio: 0 }, { line: 7, offset: 0.3, ratio: 0 })).toBe(
      false,
    );
    expect(sameAnchor({ offset: 0, ratio: 0.5 }, { offset: 0, ratio: 0.505 })).toBe(true);
    expect(sameAnchor(undefined, { offset: 0, ratio: 0 })).toBe(false);
  });
});
