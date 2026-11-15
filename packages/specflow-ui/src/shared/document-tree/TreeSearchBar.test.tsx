// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TreeSearchBar } from './TreeSearchBar';

let notify: ((stuck: boolean) => void) | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    notify = (stuck) =>
      callback(
        [
          {
            boundingClientRect: { top: stuck ? -10 : 50 },
            rootBounds: { top: 8 },
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

afterEach(() => {
  cleanup();
  notify = undefined;
  vi.unstubAllGlobals();
});

const bar = () => screen.getByRole('search');

describe('TreeSearchBar', () => {
  it('is a search row with no surface and no divider of its own, not sticky by default', () => {
    const { container } = render(
      <TreeSearchBar>
        <input type="search" />
      </TreeSearchBar>,
    );

    expect(bar().className).toContain('border-transparent');
    expect(bar().className).not.toContain('sticky');
    expect(bar().className).not.toContain('workspace-docked-bar');
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('paints a sticky bar opaque always and shows the divider only while it is docked', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const root = document.createElement('div');
    // At rest: the sentinel (jsdom's 0) is well below the root's top.
    root.getBoundingClientRect = () => ({ top: -100 }) as DOMRect;
    const { container } = render(
      <TreeSearchBar sticky scrollRoot={root}>
        <input type="search" />
      </TreeSearchBar>,
    );

    // The sentinel is a sibling outside the flow, never inside the bar that moves with it.
    const sentinel = container.querySelector('[aria-hidden="true"]');
    expect(sentinel?.className).toContain('absolute');
    expect(bar().contains(sentinel)).toBe(false);
    expect(bar().className).toContain('sticky');
    // Opaque from the first frame; only the divider waits for the stuck state.
    expect(bar().className).toContain('workspace-docked-bar');
    expect(bar().className).toContain('border-transparent');

    act(() => notify!(true));
    expect(bar().className).toContain('border-divider');
    expect(bar().className).not.toContain('border-transparent');
    expect(bar().dataset.stuck).toBe('true');

    act(() => notify!(false));
    expect(bar().className).toContain('workspace-docked-bar');
    expect(bar().className).toContain('border-transparent');
  });
});
