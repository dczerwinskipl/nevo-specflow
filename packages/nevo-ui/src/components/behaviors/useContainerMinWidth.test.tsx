// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useContainerMinWidth } from './useContainerMinWidth';

let observerCallbacks: ResizeObserverCallback[];
let currentWidth: number;
let commits: number;

function Probe({ minWidth = 1000, hysteresis }: { minWidth?: number; hysteresis?: number }) {
  const { matches, setElement } = useContainerMinWidth<HTMLDivElement>(minWidth, { hysteresis });
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

  it('enters at the minimum and leaves only below the exit margin', () => {
    render(<Probe hysteresis={16} />);

    resizeTo(1000);
    expect(screen.getByTestId('probe').textContent).toBe('wide');
    // Within the margin (a scrollbar appearing with the new content): no oscillation.
    resizeTo(985);
    expect(screen.getByTestId('probe').textContent).toBe('wide');
    resizeTo(983);
    expect(screen.getByTestId('probe').textContent).toBe('narrow');
    // Entering again needs the full minimum.
    resizeTo(990);
    expect(screen.getByTestId('probe').textContent).toBe('narrow');
    resizeTo(1000);
    expect(screen.getByTestId('probe').textContent).toBe('wide');
  });

  it('reports when the first read has happened', () => {
    let measured: boolean[] = [];
    function Reporter() {
      const result = useContainerMinWidth<HTMLDivElement>(1000);
      measured = [...measured, result.measured];

      return <div ref={result.setElement} />;
    }

    render(<Reporter />);

    expect(measured[0]).toBe(false);
    expect(measured.at(-1)).toBe(true);
  });
});
