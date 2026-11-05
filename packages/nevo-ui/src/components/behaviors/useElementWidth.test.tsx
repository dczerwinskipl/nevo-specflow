// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useElementWidth } from './useElementWidth';

let rafCallbacks: Map<number, FrameRequestCallback>;
let observerCallbacks: ResizeObserverCallback[];
let currentWidth: number;
let commits: number;

function Probe() {
  const { width, setElement } = useElementWidth<HTMLDivElement>();
  commits += 1;

  return (
    <div ref={setElement} data-testid="probe">
      {width}
    </div>
  );
}

beforeEach(() => {
  rafCallbacks = new Map();
  observerCallbacks = [];
  currentWidth = 500;
  commits = 0;
  let nextId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafCallbacks.set(++nextId, callback);

    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => rafCallbacks.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observerCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: currentWidth }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useElementWidth', () => {
  it('commits one width per frame however many ResizeObserver callbacks fire in it', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('500');
    const rendersBefore = commits;

    act(() => {
      for (const width of [480, 460, 440, 420]) {
        currentWidth = width;
        observerCallbacks.forEach((callback) => callback([], {} as ResizeObserver));
      }
    });
    expect(commits).toBe(rendersBefore);
    expect(rafCallbacks.size).toBe(1);

    act(() => {
      rafCallbacks.forEach((callback) => callback(0));
      rafCallbacks.clear();
    });
    expect(commits).toBe(rendersBefore + 1);
    expect(screen.getByTestId('probe').textContent).toBe('420');
  });

  it('cancels a pending frame on unmount', () => {
    const { unmount } = render(<Probe />);
    act(() => observerCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
    expect(rafCallbacks.size).toBe(1);
    unmount();
    expect(rafCallbacks.size).toBe(0);
  });
});
