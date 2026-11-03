// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewportInset } from '../behaviors/useVisualViewportInset';
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from './AlertDialog';
import { Dialog, DialogBody, DialogContent, DialogTitle } from './Dialog';
import { Drawer, DrawerContent, DrawerTitle, type DrawerSide } from './Drawer';

class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  scale = 1;
}

let viewport: FakeVisualViewport;
let frames: FrameRequestCallback[] = [];

function flushFrames() {
  act(() => {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  });
}

function setViewport(next: Partial<Pick<FakeVisualViewport, 'height' | 'offsetTop' | 'scale'>>) {
  Object.assign(viewport, next);
  act(() => {
    viewport.dispatchEvent(new Event('resize'));
  });
  flushFrames();
}

beforeEach(() => {
  viewport = new FakeVisualViewport();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  // Animation frames are queued and flushed explicitly (see `flushFrames`).
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);

    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'visualViewport');
});

describe('useVisualViewportInset', () => {
  it('is null with no keyboard and reports the covered area once the visual viewport shrinks', () => {
    const { result } = renderHook(() => useVisualViewportInset());
    expect(result.current).toBeNull();

    setViewport({ height: 480 });
    expect(result.current).toEqual({ inset: 320, height: 480, offsetTop: 0 });

    setViewport({ height: 800 });
    expect(result.current).toBeNull();
  });

  it('subtracts a scrolled visual viewport (iOS) from the inset', () => {
    const { result } = renderHook(() => useVisualViewportInset());
    setViewport({ height: 450, offsetTop: 50 });
    expect(result.current).toEqual({ inset: 300, height: 450, offsetTop: 50 });
  });

  it('ignores browser-chrome noise and pinch zoom', () => {
    const { result } = renderHook(() => useVisualViewportInset());
    setViewport({ height: 760 });
    expect(result.current).toBeNull();
    setViewport({ height: 400, scale: 2 });
    expect(result.current).toBeNull();
  });

  it('does nothing when disabled and removes its listeners on unmount', () => {
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const disabled = renderHook(() => useVisualViewportInset(false));
    setViewport({ height: 480 });
    expect(disabled.result.current).toBeNull();

    const enabled = renderHook(() => useVisualViewportInset());
    enabled.unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('is safe without visualViewport', () => {
    Reflect.deleteProperty(window, 'visualViewport');
    const { result } = renderHook(() => useVisualViewportInset());
    expect(result.current).toBeNull();
  });
});

function renderDrawer(side: DrawerSide, size: 'default' | 'compact' = 'default') {
  render(
    <Drawer open>
      <DrawerContent closeLabel="Close" side={side} size={size}>
        <DrawerTitle>Sheet</DrawerTitle>
        <input aria-label="Name" />
      </DrawerContent>
    </Drawer>,
  );

  return screen.getByRole('dialog');
}

describe('Drawer keyboard avoidance', () => {
  it('lifts a bottom sheet by the keyboard inset and caps it to the visible area', () => {
    const panel = renderDrawer('bottom');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.maxHeight).toBe('');

    setViewport({ height: 480 });
    expect(panel.style.bottom).toBe('320px');
    expect(panel.style.maxHeight).toBe('min(432px, 100dvh - 3rem)');
    expect(panel.style.paddingBottom).toBe('0px');

    setViewport({ height: 800 });
    expect(panel.style.bottom).toBe('');
    expect(panel.style.maxHeight).toBe('');
  });

  it('keeps the compact cap while lifted', () => {
    const panel = renderDrawer('bottom', 'compact');
    setViewport({ height: 480 });
    expect(panel.style.maxHeight).toBe('min(432px, 65dvh)');
  });

  it.each<DrawerSide>(['left', 'right', 'top'])('leaves the %s panel untouched', (side) => {
    const panel = renderDrawer(side);
    setViewport({ height: 480 });
    expect(panel.style.bottom).toBe('');
    expect(panel.style.maxHeight).toBe('');
  });
});

describe('Dialog keyboard avoidance', () => {
  function renderDialog() {
    render(
      <Dialog open>
        <DialogContent style={{ color: 'red' }}>
          <DialogTitle>Rename</DialogTitle>
          <DialogBody>
            <input aria-label="Name" />
          </DialogBody>
        </DialogContent>
      </Dialog>,
    );

    return screen.getByRole('dialog');
  }

  it('applies nothing while no keyboard is open', () => {
    const dialog = renderDialog();
    expect(dialog.style.top).toBe('');
    expect(dialog.style.maxHeight).toBe('');
    expect(dialog.style.color).toBe('red');
  });

  it('re-centres within the visible area and caps its height while the keyboard is open', () => {
    const dialog = renderDialog();
    setViewport({ height: 480 });
    expect(dialog.style.top).toBe('240px');
    expect(dialog.style.maxHeight).toBe('448px');
    expect(dialog.style.color).toBe('red');

    setViewport({ height: 450, offsetTop: 50 });
    expect(dialog.style.top).toBe('275px');

    setViewport({ height: 800, offsetTop: 0 });
    expect(dialog.style.top).toBe('');
    expect(dialog.style.maxHeight).toBe('');
  });

  it('scrolls the focused field into view when the keyboard opens', () => {
    const dialog = renderDialog();
    const input = screen.getByLabelText('Name');
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    input.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    setViewport({ height: 480 });
    flushFrames();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});

describe('AlertDialog keyboard avoidance', () => {
  it('re-centres within the visible area only while the keyboard is open', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.style.top).toBe('');

    setViewport({ height: 500 });
    expect(dialog.style.top).toBe('250px');
    expect(dialog.style.maxHeight).toBe('468px');

    setViewport({ height: 800 });
    expect(dialog.style.top).toBe('');
  });
});
