// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stuckEarlyPx, useStuck } from './useStuck';

/** The observers the hook created, with what they were given. */
let observers: {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observed: Element[];
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    const record = { callback, options, observed: [] as Element[], disconnect: vi.fn() };
    observers.push(record);
    this.observe = (element: Element) => record.observed.push(element);
    this.disconnect = record.disconnect;
  }
  observe: (element: Element) => void;
  disconnect: () => void;
}

const rect = (top: number) => ({ top, bottom: top + 1 }) as DOMRectReadOnly;

/** The sentinel's top when the component mounts (the root's top is 100). */
let sentinelTop = 140;

function Probe({ root }: { root: HTMLElement | null }) {
  const { sentinelRef, stuck } = useStuck(root);

  return (
    <>
      <span
        data-testid="sentinel"
        ref={(element) => {
          if (element) {
            element.getBoundingClientRect = () => rect(sentinelTop);
          }

          sentinelRef(element);
        }}
      />
      <p>{stuck ? 'stuck' : 'at rest'}</p>
    </>
  );
}

function rootAt(top: number) {
  const root = document.createElement('div');
  root.getBoundingClientRect = () => rect(top);

  return root;
}

const notify = (sentinelTopNow: number) =>
  act(() => {
    const observer = observers.at(-1)!;
    observer.callback(
      [
        {
          boundingClientRect: rect(sentinelTopNow),
          rootBounds: rect(100 + stuckEarlyPx),
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  });

beforeEach(() => {
  observers = [];
  sentinelTop = 140;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useStuck', () => {
  it('observes the sentinel in the scroll root, switching a few pixels early', () => {
    const root = rootAt(100);
    render(<Probe root={root} />);

    expect(observers).toHaveLength(1);
    expect(observers[0]!.options?.root).toBe(root);
    expect(observers[0]!.options?.rootMargin).toBe(`-${stuckEarlyPx}px 0px 0px 0px`);
    expect(observers[0]!.observed).toEqual([screen.getByTestId('sentinel')]);
    expect(screen.getByText('at rest')).toBeTruthy();
  });

  it('is stuck while the sentinel is above the root top, at rest when it comes back', () => {
    render(<Probe root={rootAt(100)} />);

    notify(100 + stuckEarlyPx - 1);
    expect(screen.getByText('stuck')).toBeTruthy();

    notify(100 + stuckEarlyPx);
    expect(screen.getByText('at rest')).toBeTruthy();
  });

  it('starts stuck when the scroller opens already scrolled, before any observer callback', () => {
    sentinelTop = 20;
    render(<Probe root={rootAt(100)} />);

    expect(screen.getByText('stuck')).toBeTruthy();
  });

  it('observes nothing without a root and stops observing on unmount', () => {
    const { rerender, unmount } = render(<Probe root={null} />);
    expect(observers).toHaveLength(0);
    expect(screen.getByText('at rest')).toBeTruthy();

    rerender(<Probe root={rootAt(100)} />);
    unmount();

    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });
});
