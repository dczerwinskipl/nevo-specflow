// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePaneScrollMemory } from './usePaneScrollMemory';

/** A viewport whose scroll position can be set (jsdom has no layout). */
function viewport() {
  const element = document.createElement('div');
  let top = 0;
  Object.defineProperty(element, 'scrollTop', {
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });

  return element;
}

describe('usePaneScrollMemory', () => {
  it('keeps the position a press starts from, before the scroll event of that position', () => {
    const pane = viewport();
    const { rerender } = renderHook(({ entry }) => usePaneScrollMemory(entry, pane), {
      initialProps: { entry: 'list-press' },
    });

    // Scrolled and pressed (opening a result) before the next frame's scroll event.
    pane.scrollTop = 120;
    pane.dispatchEvent(new Event('pointerdown'));
    rerender({ entry: 'article-press' });
    pane.scrollTop = 0;

    // Back to the list entry: its position is restored.
    rerender({ entry: 'list-press' });
    expect(pane.scrollTop).toBe(120);
  });
});
