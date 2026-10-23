// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  type DrawerSide,
} from './Drawer';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDrawer(side?: DrawerSide) {
  render(
    <Drawer>
      <DrawerTrigger>Open</DrawerTrigger>
      <DrawerContent closeLabel="Close sheet" side={side}>
        <DrawerHeader>
          <DrawerTitle>Contents</DrawerTitle>
          <DrawerDescription>Jump to a section</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <button type="button">Section 1</button>
        </DrawerBody>
      </DrawerContent>
    </Drawer>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  return screen.getByRole('dialog', { name: 'Contents' });
}

describe('DrawerContent side', () => {
  it('defaults to a right-anchored side panel', () => {
    const panel = renderDrawer();
    expect(panel.getAttribute('data-side')).toBe('right');
    expect(panel.className).toContain('inset-y-0');
    expect(panel.className).toContain('right-0');
    expect(panel.className).toContain('border-l');
    expect(panel.className).toContain('sm:w-[28rem]');
    expect(panel.className).toContain('md:w-[30rem]');
    expect(panel.className).not.toContain('rounded-');
  });

  it('keeps the left panel anchored to the left edge', () => {
    const panel = renderDrawer('left');
    expect(panel.getAttribute('data-side')).toBe('left');
    expect(panel.className).toContain('left-0');
    expect(panel.className).toContain('border-r');
    expect(panel.className).toContain('md:w-[30rem]');
  });

  it('anchors the bottom sheet with rounded top corners, scroll cap, safe area and a centred narrow column from md', () => {
    const panel = renderDrawer('bottom');
    expect(panel.getAttribute('data-side')).toBe('bottom');
    expect(panel.className).toContain('inset-x-0');
    expect(panel.className).toContain('bottom-0');
    expect(panel.className).toContain('rounded-t-surface');
    expect(panel.className).toContain('max-h-[calc(100dvh-3rem)]');
    expect(panel.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(panel.className).toContain('md:w-content-narrow');
    expect(panel.className).toContain('md:mx-auto');
    expect(panel.className).toContain('md:max-w-full');
    expect(panel.className).not.toContain('inset-y-0');
    expect(panel.className).not.toContain('sm:w-[28rem]');
  });

  it('mirrors the sheet at the top edge', () => {
    const panel = renderDrawer('top');
    expect(panel.getAttribute('data-side')).toBe('top');
    expect(panel.className).toContain('top-0');
    expect(panel.className).toContain('rounded-b-surface');
    expect(panel.className).toContain('pt-[env(safe-area-inset-top)]');
    expect(panel.className).toContain('md:w-content-narrow');
    expect(screen.getByRole('button', { name: 'Close sheet' }).className).toContain(
      'safe-area-inset-top',
    );
  });
});

describe.each<DrawerSide>(['left', 'right', 'top', 'bottom'])('%s accessibility', (side) => {
  it('is a modal dialog named by its title and described, with a named close action', () => {
    const panel = renderDrawer(side);
    expect(panel.getAttribute('aria-labelledby')).toBe(
      screen.getByRole('heading', { name: 'Contents' }).id,
    );
    expect(panel.getAttribute('aria-describedby')).toBe(screen.getByText('Jump to a section').id);
    expect(screen.getByRole('button', { name: 'Close sheet' })).toBeTruthy();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    renderDrawer(side);
    const trigger = screen.getByRole('button', { name: 'Open', hidden: true });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes from the close action', () => {
    renderDrawer(side);
    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
