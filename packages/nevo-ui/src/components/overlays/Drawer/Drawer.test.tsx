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
  type DrawerContentProps,
  type DrawerSide,
  type DrawerSize,
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

function renderDrawer(side?: DrawerSide, contentProps: Partial<DrawerContentProps> = {}) {
  render(
    <Drawer>
      <DrawerTrigger>Open</DrawerTrigger>
      <DrawerContent closeLabel="Close sheet" side={side} {...(contentProps as object)}>
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
    expect(panel.className).toContain('md:w-[30rem]');
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
    expect(panel.className).toContain('md:w-[30rem]');
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

describe('DrawerContent sheet behaviour', () => {
  it('lets the consumer take over open and close focus', async () => {
    const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault());
    const onCloseAutoFocus = vi.fn((event: Event) => {
      event.preventDefault();
      document.getElementById('elsewhere')?.focus();
    });
    render(
      <button id="elsewhere" type="button">
        Elsewhere
      </button>,
    );
    renderDrawer('bottom', { onOpenAutoFocus, onCloseAutoFocus });
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('elsewhere')));
  });

  it('closes on overlay click', async () => {
    renderDrawer('bottom');
    const overlay = document.querySelector<HTMLElement>('.drawer-overlay');
    expect(overlay).not.toBeNull();
    // Radix registers its outside-pointer listener on the next tick.
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireEvent.pointerDown(overlay!, { pointerType: 'mouse', button: 0, ctrlKey: false });
    fireEvent.pointerUp(overlay!);
    fireEvent.click(overlay!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('omits the close action when showClose is false', () => {
    renderDrawer('top', { showClose: false });
    expect(screen.queryByRole('button', { name: 'Close sheet' })).toBeNull();
  });

  it('renders the body as a DS scroll area that can shrink inside a content-sized sheet', () => {
    const panel = renderDrawer('bottom');
    const viewport = panel.querySelector('.scroll-area-viewport');
    expect(viewport).not.toBeNull();
    const root = viewport!.parentElement!;
    expect(root.className).toContain('flex-col');
    expect(root.className).toContain('min-h-0');
  });
});

describe('DrawerContent size and header', () => {
  it('caps a default sheet below the top edge and a compact sheet at 65dvh', () => {
    expect(renderDrawer('bottom').className).toContain('max-h-[calc(100dvh-3rem)]');
    cleanup();
    const compact = renderDrawer('bottom', { size: 'compact' });
    expect(compact.className).toContain('max-h-[65dvh]');
    expect(compact.className).not.toContain('max-h-[calc(100dvh-3rem)]');
    cleanup();
    expect(renderDrawer('top', { size: 'compact' }).className).toContain('max-h-[65dvh]');
  });

  it('ignores size on side panels', () => {
    for (const side of ['left', 'right'] as const) {
      const className = renderDrawer(side, { size: 'compact' satisfies DrawerSize }).className;
      expect(className).not.toContain('max-h-');
      cleanup();
    }
  });

  it('reserves room for the close action in the header only when it is rendered', () => {
    renderDrawer('bottom');
    const withClose = document.querySelector('[data-design-slot="header"]')!;
    expect(withClose.className).toContain('px-5');
    expect(withClose.className).toContain('pr-14');
    cleanup();
    renderDrawer('bottom', { showClose: false });
    const without = document.querySelector('[data-design-slot="header"]')!;
    expect(without.className).toContain('px-5');
    expect(without.className).not.toContain('pr-14');
  });
});
