// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useContainerMinWidth } from './useContainerMinWidth';

let observerCallbacks: ResizeObserverCallback[];
let currentWidth: number;
let commits: number;

function Probe({ minWidth = 1000 }: { minWidth?: number }) {
  const { matches, setElement } = useContainerMinWidth<HTMLDivElement>(minWidth);
  commits += 1;

  return (
    <div ref={setElement} data-testid="probe">
      {matches ? 'wide' : 'narrow'}
    </div>
  );
}

function resizeTo(width: number) {
  currentWidth = width;
  for (const callback of observerCallbacks) {
    callback([], {} as ResizeObserver);
  }
}

beforeEach(() => {
  observerCallbacks = [];
  currentWidth = 500;
  commits = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observerCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
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

describe('useContainerMinWidth', () => {
  it('reads the breakpoint before the first paint, inclusive of the minimum', () => {
    currentWidth = 1000;
    render(<Probe />);

    expect(screen.getByTestId('probe').textContent).toBe('wide');
  });

  it('commits a crossing synchronously, inside the observer callback', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('narrow');

    // No act() and no frame: the new arrangement is in the DOM when the callback returns.
    resizeTo(1200);
    expect(screen.getByTestId('probe').textContent).toBe('wide');
    resizeTo(999);
    expect(screen.getByTestId('probe').textContent).toBe('narrow');
  });

  it('does not render for widths on the same side of the breakpoint', () => {
    render(<Probe />);
    const settled = commits;

    resizeTo(600);
    resizeTo(999);

    expect(commits).toBe(settled);
  });
});
