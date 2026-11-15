// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewVisitScroll } from './OverviewVisitScroll';

const state = vi.hoisted(() => ({
  scroller: undefined as HTMLElement | undefined,
  remembered: undefined as { scrollY: number } | undefined,
}));

vi.mock('@nevo/ui', () => ({ useWorkspacePrimaryScroll: () => state.scroller }));
vi.mock('@tanstack/react-router', () => ({
  useElementScrollRestoration: () => state.remembered,
  useRouterState: () => false,
}));

let resized: (() => void)[] = [];

class FakeResizeObserver {
  private readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe() {
    resized.push(this.callback);
  }
  disconnect() {
    resized = resized.filter((callback) => callback !== this.callback);
  }
}

describe('OverviewVisitScroll', () => {
  beforeEach(() => {
    resized = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const scroller = document.createElement('div');
    scroller.appendChild(document.createElement('section'));
    state.scroller = scroller;
    state.remembered = { scrollY: 300 };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('re-applies the remembered position while late sections grow', () => {
    render(<OverviewVisitScroll />);
    expect(state.scroller?.scrollTop).toBe(300);

    state.scroller!.scrollTop = 0;
    act(() => resized.forEach((callback) => callback()));
    expect(state.scroller?.scrollTop).toBe(300);
  });

  it('never re-applies after the reader acts, even when late data re-renders the visit', () => {
    const view = render(<OverviewVisitScroll />);
    const scroller = state.scroller!;

    act(() => {
      scroller.dispatchEvent(new Event('wheel'));
    });
    scroller.scrollTop = 40;
    act(() => resized.forEach((callback) => callback()));
    expect(scroller.scrollTop).toBe(40);

    // A late refresh hands the router's newer remembered position to the same visit.
    state.remembered = { scrollY: 500 };
    view.rerender(<OverviewVisitScroll />);
    act(() => resized.forEach((callback) => callback()));
    expect(scroller.scrollTop).toBe(40);
  });
});
