import { act } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Drives the width `AppShell` measures in jsdom (`getBoundingClientRect` + the observer's callback),
 * so a test can sit on one side of the workspace thresholds and cross them: `600` is the mobile
 * scheme, `780` the band where a runtime Secondary already splits but root tabs do not exist
 * (`supportsSplit` false), `1400` the split scheme (pinned Context tab, root tabs).
 * Call in `beforeEach`; `vi.unstubAllGlobals()` and `vi.restoreAllMocks()` undo it.
 */
export function installWorkspaceWidth(initial: number) {
  let width = initial;
  const observers: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push(callback);
      }
      observe() {
        /* jsdom has no layout observer. */
      }
      unobserve() {
        /* jsdom has no layout observer. */
      }
      disconnect() {
        /* jsdom has no layout observer. */
      }
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);

    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width,
    height: 800,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 800,
    toJSON: () => ({}),
  }));

  return {
    /** Resizes the window: every observer measures again. */
    async setWidth(next: number) {
      width = next;
      await act(async () => {
        observers.forEach((callback) => callback([], {} as ResizeObserver));
        await Promise.resolve();
      });
    },
  };
}
