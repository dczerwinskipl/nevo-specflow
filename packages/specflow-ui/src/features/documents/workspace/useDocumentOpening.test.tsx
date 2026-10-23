// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { createRef, StrictMode, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentOpening } from './useDocumentOpening';

interface Controller {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  isOpen?: boolean;
}
const mocks = vi.hoisted(() => ({
  controller: undefined as unknown as Controller,
  supportsSplit: false,
  tabs: {
    show: vi.fn(() => Promise.resolve()),
    closeAll: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@nevo/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nevo/ui')>()),
  // A fresh object per render mirrors the real controller, whose identity changes on open/close.
  useSecondaryNavigation: () => ({ ...mocks.controller }),
  useWorkspaceCapabilities: () => ({ supportsSplit: mocks.supportsSplit }),
}));
vi.mock('../tabs/DocumentTabsProvider', () => ({ useDocumentTabs: () => mocks.tabs }));
vi.mock('./DocumentPane', () => ({ documentStack: { id: 'document-stack' } }));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};
const flush = () => act(() => Promise.resolve());

function render(
  initial: string | undefined,
  strict = false,
  requestRef: RefObject<(() => Promise<boolean>) | null> = createRef(),
) {
  return renderHook(
    ({ documentId }: { documentId?: string }) =>
      useDocumentOpening({ specId: 's', documentId, requestRef }),
    { initialProps: { documentId: initial }, ...(strict ? { wrapper: StrictMode } : {}) },
  );
}
const opened = () =>
  mocks.controller.open.mock.calls.map(
    ([, params]) => (params as { documentId: string }).documentId,
  );

describe('useDocumentOpening stacked navigation (narrow layout)', () => {
  const closes: ReturnType<typeof deferred>[] = [];
  beforeEach(() => {
    closes.length = 0;
    mocks.supportsSplit = false;
    mocks.controller = {
      open: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => {
        const pending = deferred();
        closes.push(pending);
        return pending.promise;
      }),
    };
  });
  afterEach(cleanup);

  it('opens only the latest document after quick A -> B -> C transitions with a delayed close', async () => {
    const view = render('A');
    view.rerender({ documentId: 'B' });
    view.rerender({ documentId: 'C' });
    await flush();
    expect(closes).toHaveLength(3);
    // Closes settle out of order and late: C first, then A and B.
    for (const index of [2, 0, 1]) {
      closes[index]!.resolve();
      await flush();
    }
    expect(opened()).toEqual(['C']);
  });

  it('does not open a superseded document even when its close settles first', async () => {
    const view = render('A');
    view.rerender({ documentId: 'B' });
    await flush();
    closes[0]!.resolve();
    await flush();
    expect(opened()).toEqual([]);
    closes[1]!.resolve();
    await flush();
    expect(opened()).toEqual(['B']);
  });

  it('does not open anything when the route leaves the document while a close is pending', async () => {
    const view = render('A');
    view.rerender({ documentId: undefined });
    await flush();
    closes.forEach((pending) => pending.resolve());
    await flush();
    expect(opened()).toEqual([]);
  });

  it('does not open after unmount during a pending close', async () => {
    const view = render('A');
    await flush();
    view.unmount();
    closes.forEach((pending) => pending.resolve());
    await flush();
    expect(mocks.controller.open).not.toHaveBeenCalled();
  });

  it('opens a single time when the controller identity changes while the close is pending', async () => {
    const view = render('A');
    view.rerender({ documentId: 'A' });
    view.rerender({ documentId: 'A' });
    await flush();
    closes.forEach((pending) => pending.resolve());
    await flush();
    expect(opened()).toEqual(['A']);
  });

  it('still opens the document once under StrictMode double effects', async () => {
    render('A', true);
    await flush();
    closes.forEach((pending) => pending.resolve());
    await flush();
    expect(opened()).toEqual(['A']);
  });

  it('never opens a stack in the wide layout', async () => {
    mocks.supportsSplit = true;
    render('A');
    await flush();
    closes.forEach((pending) => pending.resolve());
    await flush();
    expect(mocks.controller.open).not.toHaveBeenCalled();
  });
});

describe('useDocumentOpening narrow tabs', () => {
  beforeEach(() => {
    mocks.supportsSplit = false;
    mocks.controller = {
      open: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
    };
  });
  afterEach(cleanup);

  it('does not close and reopen the stacked screen when only the active tab changes', async () => {
    const view = render('A');
    await flush();
    expect(opened()).toEqual(['A']);
    mocks.controller.isOpen = true;
    view.rerender({ documentId: 'B' });
    await flush();
    expect(opened()).toEqual(['A']);
    expect(mocks.controller.close).toHaveBeenCalledTimes(1);
  });

  it('opens the stack again for another document after Back closed it', async () => {
    const view = render('A');
    await flush();
    // Back closed the stacked screen (it unregistered); the route still shows A.
    mocks.controller.isOpen = false;
    view.rerender({ documentId: 'B' });
    await flush();
    expect(opened()).toEqual(['A', 'B']);
  });

  it('keeps tabs and the route when the list is shown by Back', async () => {
    const view = render('A');
    await flush();
    act(() => view.result.current.select('A'));
    await flush();
    // Selecting the document that is already active reopens the stack without touching the tabs.
    expect(opened()).toEqual(['A', 'A']);
    expect(mocks.tabs.show).not.toHaveBeenCalled();
    expect(mocks.tabs.closeAll).not.toHaveBeenCalled();
  });
});

describe('useDocumentOpening tabs', () => {
  beforeEach(() => {
    mocks.supportsSplit = true;
    mocks.tabs.show.mockClear();
    mocks.tabs.closeAll.mockClear();
    mocks.controller = {
      open: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
    };
  });
  afterEach(cleanup);

  it('shows another document through the tabs and not the one already on screen', () => {
    const view = render('A');
    act(() => view.result.current.select('B'));
    expect(mocks.tabs.show).toHaveBeenCalledWith('B');
    act(() => view.result.current.select('A'));
    expect(mocks.tabs.show).toHaveBeenCalledTimes(1);
  });

  it('closes every tab only after the one question is answered yes', async () => {
    const answers = [false, true];
    const ask = { current: vi.fn(() => Promise.resolve(answers.shift()!)) };
    const view = render('A', false, ask);
    act(() => view.result.current.closeAll());
    await flush();
    expect(mocks.tabs.closeAll).not.toHaveBeenCalled();
    act(() => view.result.current.closeAll());
    await flush();
    expect(ask.current).toHaveBeenCalledTimes(2);
    expect(mocks.tabs.closeAll).toHaveBeenCalledTimes(1);
  });
});
