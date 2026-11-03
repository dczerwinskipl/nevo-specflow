// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import { AppWorkspaceProvider, useSecondaryNavigation } from './WorkspaceContext';
import { WorkspaceHeader } from './WorkspaceHeader';
import { useWorkspaceLayout } from './useWorkspaceLayout';

// The `secondaryRatio` / `onSecondaryRatioChange` contract of `split="dynamic"`
// (workspace-dynamic-split.md "Ratio contract"): a controlled ratio is clamped like any other manual
// ratio, a restored value survives mount, and only user changes / out-of-range corrections report.

type Change = [number, 'auto' | 'manual'];

function mockWorkspaceWidth(width: number | undefined) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: width ?? 0,
    height: 600,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width ?? 0,
    bottom: 600,
    toJSON: () => ({}),
  }));
}

function Host({
  ratio,
  onChange,
}: {
  ratio?: number;
  onChange?: (ratio: number, mode: 'auto' | 'manual') => void;
}) {
  return (
    <AppShell navigation={<div>Nav</div>}>
      <AppWorkspace
        fit="available"
        onSecondaryRatioChange={onChange}
        secondaryRatio={ratio}
        split="dynamic"
      >
        <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
          <div>Primary content</div>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary header={<WorkspaceHeader title="Secondary" />}>
          <div>Secondary content</div>
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  );
}

function ControlledHost({ initial, calls }: { initial: number; calls: Change[] }) {
  const [ratio, setRatio] = useState(initial);

  return (
    <Host
      onChange={(next, mode) => {
        calls.push([next, mode]);
        setRatio(next);
      }}
      ratio={ratio}
    />
  );
}

function splitter() {
  return screen.getByRole('separator', { name: /resize/i });
}

function primaryWidthPx() {
  const element = document.querySelector<HTMLElement>('[data-workspace-surface="primary"]');

  return Number.parseFloat(element?.style.maxWidth ?? 'NaN');
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AppWorkspace split="dynamic" ratio contract', () => {
  beforeEach(() => {
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([0.95, 0.05, 1.5, -1])(
    'clamps a controlled ratio of %s into the valid range (Primary never below 400px)',
    async (ratio) => {
      mockWorkspaceWidth(1000);
      render(<Host ratio={ratio} />);
      await flush();

      const min = Number(splitter().getAttribute('aria-valuemin'));
      const max = Number(splitter().getAttribute('aria-valuemax'));
      const now = Number(splitter().getAttribute('aria-valuenow'));

      expect(now).toBeGreaterThanOrEqual(min);
      expect(now).toBeLessThanOrEqual(max);
      expect(primaryWidthPx()).toBeGreaterThanOrEqual(399);
    },
  );

  it('keeps a restored ratio on mount and never echoes the auto ratio over it', async () => {
    mockWorkspaceWidth(1000);
    const calls: Change[] = [];
    render(<ControlledHost calls={calls} initial={0.6} />);
    await flush();

    expect(splitter().getAttribute('aria-valuenow')).toBe('60');
    expect(calls).toEqual([]);
  });

  it('restores a controlled value after a remount without a first auto report', async () => {
    mockWorkspaceWidth(1000);
    const calls: Change[] = [];
    const first = render(<ControlledHost calls={calls} initial={0.6} />);
    await flush();
    first.unmount();
    render(<ControlledHost calls={calls} initial={0.6} />);
    await flush();

    expect(splitter().getAttribute('aria-valuenow')).toBe('60');
    expect(calls.some(([, mode]) => mode === 'auto')).toBe(false);
  });

  it('reports a resize after restore as manual and renders it', async () => {
    mockWorkspaceWidth(1000);
    const calls: Change[] = [];
    render(<ControlledHost calls={calls} initial={0.6} />);
    await flush();

    await act(async () => {
      fireEvent.keyDown(splitter(), { key: 'ArrowRight' });
      await Promise.resolve();
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe('manual');
    expect(calls[0]?.[0]).not.toBeCloseTo(0.6, 3);
    expect(splitter().getAttribute('aria-valuenow')).toBe(String(Math.round(calls[0]![0] * 100)));
  });

  it('reports a later out-of-range controlled value once, clamped', async () => {
    mockWorkspaceWidth(1000);
    const calls: Change[] = [];
    function Probe() {
      const [ratio, setRatio] = useState(0.5);

      return (
        <>
          <button onClick={() => setRatio(0.95)} type="button">
            Set high
          </button>
          <Host
            onChange={(next, mode) => {
              calls.push([next, mode]);
            }}
            ratio={ratio}
          />
        </>
      );
    }

    render(<Probe />);
    await flush();
    expect(calls).toEqual([]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set high' }));
      await Promise.resolve();
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe('manual');
    expect(calls[0]?.[0]).toBeCloseTo(0.6, 3);
  });

  it('uncontrolled: reports the auto ratio once the width is measured', async () => {
    mockWorkspaceWidth(1000);
    const calls: Change[] = [];
    render(<Host onChange={(ratio, mode) => calls.push([ratio, mode])} />);
    await flush();

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([, mode]) => mode === 'auto')).toBe(true);
  });
});

function LayoutProbe() {
  const { mode, primaryScrollOwner } = useWorkspaceLayout();
  const navigation = useSecondaryNavigation();

  return (
    <>
      <output data-testid="layout">{`${mode}/${primaryScrollOwner}`}</output>
      <button onClick={() => void navigation.open(runtimeStack, {})} type="button">
        Open runtime
      </button>
    </>
  );
}

const runtimeStack = defineSecondaryStack<
  Record<never, never>,
  string,
  { main: Record<never, never> }
>({
  id: 'layout-probe-runtime',
  initial: 'main',
  useData: () => ({ status: 'ready', data: 'runtime' }),
  screens: {
    main: { title: 'Runtime', component: () => <div>Runtime content</div> },
  },
});

describe('useWorkspaceLayout', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    Element.prototype.scrollIntoView ??= () => undefined;
    Element.prototype.scrollTo ??= () => undefined;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderProbe(width: number, scroll: 'workspace' | 'content' = 'workspace') {
    mockWorkspaceWidth(width);
    render(
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Nav</div>}>
          <AppWorkspace fit="available" scroll={scroll} split="dynamic">
            <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
              <LayoutProbe />
            </AppWorkspace.Primary>
          </AppWorkspace>
        </AppShell>
      </AppWorkspaceProvider>,
    );
    await flush();
  }

  async function openRuntime() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open runtime', hidden: true }));
      await Promise.resolve();
    });
  }

  const layout = () => screen.getByTestId('layout').textContent;

  it('publishes the resolved split layout for a runtime Secondary at 780px, below the 840px hint', async () => {
    await renderProbe(780);
    expect(layout()).toBe('stacked/ambient'); // Primary only: the generic split check (840).

    await openRuntime();

    expect(layout()).toBe('split/local');
    expect(document.querySelector('[data-layout="split"]')).not.toBeNull();
  });

  it('stays stacked with the ambient scroll owner below the dynamic minimum', async () => {
    await renderProbe(700);
    await openRuntime();

    expect(layout()).toBe('stacked/ambient');
  });

  it('keeps the local scroll owner when the consumer owns scrolling', async () => {
    await renderProbe(700, 'content');
    await openRuntime();

    expect(layout()).toBe('stacked/local');
  });
});
