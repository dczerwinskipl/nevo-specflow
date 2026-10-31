// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignMetadataProvider } from '@nevo/figma-capture/metadata';
import { AppShell, resolveAppShellLayout } from './AppShell';
import {
  APP_WORKSPACE_EDGE_BORDER,
  WIDE_SHELL_MIN_WIDTH,
  resolveWorkspaceContentWidth,
} from '../workspace/workspaceSizing';

describe('AppShell', () => {
  it('does not assume a desktop layout before width is known during SSR or hydration', () => {
    const markup = renderToStaticMarkup(
      <AppShell navigation={<nav aria-label="Product">Navigation</nav>}>
        <div>Workspace</div>
      </AppShell>,
    );

    expect(markup).not.toContain('<aside');
    expect(markup).toContain('<main');
    expect(markup).toContain('data-app-shell-region="workspace"');
    expect(markup).toContain('data-app-shell-workspace-material-owner="panel"');
    expect(markup).not.toContain('workspace-surface-material');
  });

  it('leaves workspace material ownership to panels throughout stacked layouts', () => {
    for (const width of [390, 840, 900, WIDE_SHELL_MIN_WIDTH - 1]) {
      expect(resolveAppShellLayout(width)).toMatchObject({
        workspaceMaterialOwner: 'panel',
        wide: false,
      });
    }

    expect(resolveAppShellLayout(WIDE_SHELL_MIN_WIDTH).workspaceMaterialOwner).toBe('shell');
  });

  it('resolves narrow, wide, and bidirectional responsive transitions deterministically', () => {
    expect(resolveAppShellLayout(undefined).navigationMode).toBe('drawer');
    expect(resolveAppShellLayout(480)).toEqual({
      availableWidth: 480,
      navigationMode: 'drawer',
      workspaceMaterialOwner: 'panel',
      wide: false,
    });
    expect(resolveAppShellLayout(900)).toEqual({
      availableWidth: 900,
      navigationMode: 'drawer',
      workspaceMaterialOwner: 'panel',
      wide: false,
    });
    expect(resolveAppShellLayout(1400)).toEqual({
      availableWidth: 1132,
      navigationMode: 'persistent',
      workspaceMaterialOwner: 'shell',
      wide: true,
    });
    expect([480, 1400, 480].map((width) => resolveAppShellLayout(width).navigationMode)).toEqual([
      'drawer',
      'persistent',
      'drawer',
    ]);
  });

  it('composes the shared environment foundations without duplicating their material CSS', async () => {
    const source = await readFile('src/app/shell/AppShell.tsx', 'utf8');

    expect(source).toContain('<AppBackground');
    expect(source).toContain('<WorkspaceSurface');
    expect(source).not.toContain('bg-workspace-material');
    expect(source).not.toContain('bg-workspace ');
  });

  it('keeps transparent environment hosts out of capture metadata without public tooling props', () => {
    const markup = renderToStaticMarkup(
      <DesignMetadataProvider captureComponents={['AppShell']}>
        <AppShell navigation={<nav>Navigation</nav>}>
          <div>Workspace</div>
        </AppShell>
      </DesignMetadataProvider>,
    );

    expect(markup.match(/data-design-component=/g)).toHaveLength(1);
    expect(markup).toContain('data-design-component="AppShell"');
    expect(markup).not.toContain('data-design-component="AppBackground"');
    expect(markup).not.toContain('data-design-component="WorkspaceSurface"');
  });
});

describe('workspace content width', () => {
  it('subtracts the surface edge borders from the published slot width, not from thresholds', () => {
    for (const width of [1280, 1366, 1440, 1600]) {
      const { availableWidth, wide } = resolveAppShellLayout(width);
      expect(wide).toBe(true);
      expect(availableWidth).toBe(width - 268);
      expect(resolveWorkspaceContentWidth(availableWidth, { bordered: true, inset: false })).toBe(
        width - 268 - APP_WORKSPACE_EDGE_BORDER,
      );
    }

    expect(resolveWorkspaceContentWidth(1172, { bordered: true, inset: true })).toBe(1170);
  });

  it('leaves panel-owned (stacked) workspaces untouched', () => {
    expect(resolveWorkspaceContentWidth(480, { bordered: false, inset: false })).toBe(480);
    expect(
      resolveWorkspaceContentWidth(undefined, { bordered: true, inset: false }),
    ).toBeUndefined();
  });
});

/**
 * Regression coverage for the "resize from 1440px to 390px leaves the layout visibly broken for
 * several seconds" bug: a continuous drag fires one `ResizeObserver` notification per pixel
 * crossed, and without coalescing, each one committed its own synchronous React state update —
 * cascading through the whole shell/workspace tree, that per-notification commit cost compounded
 * faster than the browser could paint between notifications, so the rendered layout fell further
 * and further behind the real (already-settled) window size. `useElementWidth`/`useDescendantWidth`
 * now coalesce bursts of notifications through `requestAnimationFrame`, matching the pattern
 * `ScrollArea`'s `scheduleUpdate` already uses for the same class of problem.
 */
describe('AppShell resize measurement coalescing', () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let observerCallbacks: ResizeObserverCallback[];
  let currentWidth: number;

  function flushFrames() {
    const pending = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    pending.forEach((callback) => callback(0));
  }

  function fireAllObservers() {
    observerCallbacks.forEach((callback) =>
      callback([], {
        observe() {},
        unobserve() {},
        disconnect() {},
      }),
    );
  }

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 0;
    observerCallbacks = [];
    currentWidth = 1440;

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextRafId;
      rafCallbacks.set(id, callback);

      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks.delete(id);
    });
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
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width: currentWidth,
      height: 900,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('settles on only the latest width after a fast-resize burst, not an intermediate one', () => {
    let renderCount = 0;
    function RenderCounter() {
      renderCount += 1;

      return null;
    }

    render(
      <AppShell navigation={<nav>Navigation</nav>}>
        <RenderCounter />
      </AppShell>,
    );

    // Mount settles at the initial (wide) width: the hook's own immediate `update()` call, not the
    // observer, so no frame flush is required yet.
    expect(screen.getByRole('navigation')).not.toBeNull();
    const settledRenderCount = renderCount;

    // Simulate a fast continuous drag from 1440px to 390px: many notifications arrive — crossing
    // the wide/narrow threshold (1108px) back and forth — before the browser ever gets to paint a
    // frame between them. Each one only schedules/reschedules a frame; none commits React state yet.
    for (const width of [1200, 1300, 900, 1000, 700, 500, 390]) {
      currentWidth = width;
      fireAllObservers();
    }

    expect(renderCount).toBe(settledRenderCount); // still nothing committed: all frames pending

    // Exactly one frame now runs — the whole burst coalesces into it, reading the width current at
    // flush time (390), not any of the intermediate values the burst passed through.
    act(() => {
      flushFrames();
    });

    expect(screen.queryByRole('navigation')).toBeNull(); // narrow: persistent nav became a drawer
    // A handful of commits for the one flush (shell width settling, then the dependent descendant
    // measurement reacting to `wide` flipping) — nowhere near one per burst notification (7).
    expect(renderCount - settledRenderCount).toBeLessThanOrEqual(3);
  });

  it('keeps a slower drag (one notification per frame) responsive at every step', () => {
    render(
      <AppShell navigation={<nav>Navigation</nav>}>
        <div>Workspace</div>
      </AppShell>,
    );

    expect(screen.getByRole('navigation')).not.toBeNull();

    for (const width of [1000, 600, 390]) {
      currentWidth = width;
      act(() => {
        fireAllObservers();
        flushFrames();
      });
    }

    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
