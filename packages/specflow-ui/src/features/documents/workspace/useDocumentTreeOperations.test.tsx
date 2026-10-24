// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentDraftStore } from '../editor/documentDraftStore';
import { DocumentDraftProvider } from '../editor/DocumentDraftProvider';
import { useDocumentOperations } from '../explorer/useDocumentOperations';
import { useDocumentTreeOperations } from './useDocumentTreeOperations';

interface BlockerOptions {
  shouldBlockFn: (args: unknown) => boolean;
  enableBeforeUnload: boolean;
}
const mocks = vi.hoisted(() => ({
  show: vi.fn((_id: string) => Promise.resolve()),
  removeTabs: vi.fn((_ids: readonly string[]) => Promise.resolve()),
  addDocuments: vi.fn(),
  operateDocument: vi.fn(),
  getDocument: vi.fn(),
  followTab: vi.fn((_from: string, _to: string) => Promise.resolve()),
  followSave: vi.fn(),
  blocker: undefined as BlockerOptions | undefined,
}));

vi.mock('@tanstack/react-router', () => ({
  useBlocker: (options: BlockerOptions) => {
    mocks.blocker = options;
  },
}));
vi.mock('../tabs/DocumentTabsProvider', () => ({
  useDocumentTabs: () => ({
    show: mocks.show,
    removeTabs: mocks.removeTabs,
    follow: mocks.followTab,
  }),
}));
vi.mock('../editor/DocumentEditorProvider', () => ({
  useDocumentSaveOwner: () => ({ follow: mocks.followSave }),
}));
vi.mock('../../../app/useAppServices', () => ({
  useAppServices: () => ({
    documentsApi: {
      addDocuments: mocks.addDocuments,
      operateDocument: mocks.operateDocument,
    },
    documentApi: { getDocument: mocks.getDocument },
  }),
}));

const emptyTree = {
  documents: [],
  folders: [],
  capabilities: {},
} as unknown as Parameters<typeof useDocumentOperations>[0]['tree'];

function setup() {
  const store = createDocumentDraftStore();
  const cache = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>
      <DocumentDraftProvider store={store}>{children}</DocumentDraftProvider>
    </QueryClientProvider>
  );
  const view = renderHook(
    () => {
      const treeOps = useDocumentTreeOperations({ specId: 's' });
      const ops = useDocumentOperations({
        tree: emptyTree,
        onAdd: treeOps.add,
        onOperate: treeOps.operate,
        onBusyChange: treeOps.setBusy,
      });
      return { treeOps, ops };
    },
    { wrapper },
  );
  return { store, view };
}

beforeEach(() => {
  mocks.addDocuments.mockReset();
  mocks.operateDocument.mockReset();
  mocks.getDocument.mockReset();
  mocks.show.mockClear();
  mocks.removeTabs.mockClear();
});
afterEach(cleanup);

describe('creating a file: mutation result is separate from the follow-up read', () => {
  it('keeps a confirmed create confirmed when the follow-up GET fails, and never re-POSTs', async () => {
    mocks.addDocuments.mockResolvedValue({
      documents: [{ id: 'd1', path: 'd1.md', revision: '1' }],
    });
    mocks.getDocument.mockRejectedValue(new TypeError('network down'));
    const { view } = setup();
    const settle = vi.fn();
    await act(() =>
      view.result.current.ops.actions.submitEntry(
        { key: 'k', kind: 'document', parent: '', name: 'a.md' },
        'a.md',
        settle,
      ),
    );
    expect(mocks.addDocuments).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith({ ok: true });
    expect(view.result.current.ops.state.unknown).toBe(false);
    expect(view.result.current.ops.actions.isUnknown()).toBe(false);
    expect(view.result.current.ops.state.retry).toEqual([]);
    // The new file is still opened (as a tab): the route loads it itself.
    expect(mocks.show).toHaveBeenCalledWith('d1');
  });
});

describe('tree operations and tabs', () => {
  it('opens a new empty file in edit and the first imported file in preview', async () => {
    mocks.getDocument.mockResolvedValue({
      id: 'd1',
      title: 'd1',
      filename: 'd1.md',
      content: '',
      revision: 'r1',
    });
    const { store, view } = setup();
    mocks.addDocuments.mockResolvedValue({
      documents: [{ id: 'd1', path: 'd1.md', revision: '1' }],
    });
    await act(() => view.result.current.treeOps.add([{ path: 'a.md', content: '' }] as never));
    expect(store.get('s', 'd1')?.editing).toBe(true);
    expect(mocks.show).toHaveBeenLastCalledWith('d1');

    store.remove('s', 'd1');
    mocks.addDocuments.mockResolvedValue({
      documents: [
        { id: 'd1', path: 'd1.md', revision: '1' },
        { id: 'd2', path: 'd2.md', revision: '1' },
      ],
    });
    await act(() =>
      view.result.current.treeOps.add([
        { path: 'a.md', content: 'x' },
        { path: 'b.md', content: 'y' },
      ] as never),
    );
    expect(store.get('s', 'd1')?.editing).toBe(false);
    expect(mocks.show).toHaveBeenCalledTimes(2);
    // Only the first imported file opens.
    expect(mocks.show).toHaveBeenLastCalledWith('d1');
  });

  it('opens nothing for a new folder', async () => {
    mocks.addDocuments.mockResolvedValue({ documents: [] });
    const { view } = setup();
    await act(() => view.result.current.treeOps.add([], ['docs']));
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it('closes the tabs of removed documents without asking and drops their drafts', async () => {
    mocks.operateDocument.mockResolvedValue({
      revision: 'r',
      documents: [],
      removedDocumentIds: ['d1', 'd2'],
      folders: [],
    });
    const { store, view } = setup();
    store.set('s', 'd1', { content: 'x', baseline: 'y', revision: '1', editing: false });
    await act(() =>
      view.result.current.treeOps.operate({
        action: 'delete',
        kind: 'folder',
        path: 'docs',
        expectedRevision: 'r0',
      } as never),
    );
    expect(mocks.removeTabs).toHaveBeenCalledWith(['d1', 'd2']);
    expect(store.get('s', 'd1')).toBeUndefined();
  });

  it('keeps the tab of a renamed document and moves its draft to the new revision', async () => {
    mocks.operateDocument.mockResolvedValue({
      revision: 'r',
      documents: [{ id: 'd1', path: 'new.md', revision: 'r2' }],
      removedDocumentIds: [],
      folders: [],
    });
    const { store, view } = setup();
    store.set('s', 'd1', { content: 'x', baseline: 'y', revision: 'r1', editing: false });
    await act(() =>
      view.result.current.treeOps.operate({
        action: 'rename',
        kind: 'document',
        documentId: 'd1',
        name: 'new.md',
        expectedRevision: 'r1',
      } as never),
    );
    expect(mocks.removeTabs).not.toHaveBeenCalled();
    expect(store.get('s', 'd1')).toMatchObject({ content: 'x', baseline: 'y', revision: 'r2' });
  });

  it('keeps the revision of a draft based on an older version (its next save sends that one)', async () => {
    mocks.operateDocument.mockResolvedValue({
      revision: 'r',
      documents: [{ id: 'd1', path: 'new.md', revision: 'r2' }],
      removedDocumentIds: [],
      folders: [],
    });
    const { store, view } = setup();
    // The file changed on disk (r1) after this draft was based on r0.
    store.set('s', 'd1', { content: 'x', baseline: 'y', revision: 'r0', editing: false });
    await act(() =>
      view.result.current.treeOps.operate({
        action: 'rename',
        kind: 'document',
        documentId: 'd1',
        name: 'new.md',
        expectedRevision: 'r1',
      } as never),
    );
    expect(store.get('s', 'd1')?.revision).toBe('r0');
  });

  it('classifies a dirty document: draft, save state, tab and route follow the new id', async () => {
    mocks.operateDocument.mockResolvedValue({
      revision: 'r',
      documents: [{ id: 'research', path: 'notes/a.md', revision: 'r1', type: 'research' }],
      removedDocumentIds: [],
      folders: [],
    });
    const { store, view } = setup();
    store.set('s', 'u-a', { content: 'mine', baseline: 'disk', revision: 'r0', editing: true });
    await act(() =>
      view.result.current.treeOps.operate({
        action: 'classify',
        kind: 'document',
        documentId: 'u-a',
        type: 'research',
        expectedRevision: 'r1',
      } as never),
    );
    expect(store.get('s', 'u-a')).toBeUndefined();
    // Unsaved changes survive the id change; the draft keeps the revision it was based on.
    expect(store.get('s', 'research')).toMatchObject({
      content: 'mine',
      baseline: 'disk',
      revision: 'r0',
      editing: true,
    });
    expect(mocks.followSave).toHaveBeenCalledWith('u-a', 'research');
    expect(mocks.followTab).toHaveBeenCalledWith('u-a', 'research');
  });
});

const location = (documentId?: string, specId = 's') => ({
  fullPath: documentId ? '/specs/$specId/documents/$documentId' : '/specs/$specId/documents',
  params: documentId ? { specId, documentId } : { specId },
});

describe('the busy blocker', () => {
  it('blocks leaving the screen while busy but never a move between tabs', () => {
    const { view } = setup();
    act(() => view.result.current.treeOps.setBusy(true));
    const blocker = mocks.blocker!;
    const block = (current: unknown, next: unknown) => blocker.shouldBlockFn({ current, next });
    expect(block(location('a'), location('b'))).toBe(false);
    expect(block(location('a'), location())).toBe(false);
    expect(block(location('a'), { fullPath: '/specs', params: {} })).toBe(true);
    expect(block(location('a'), location('a', 'other'))).toBe(true);
    expect(blocker.enableBeforeUnload).toBe(true);
  });

  it('blocks nothing while idle', () => {
    setup();
    const blocker = mocks.blocker!;
    expect(
      blocker.shouldBlockFn({ current: location('a'), next: { fullPath: '/', params: {} } }),
    ).toBe(false);
    expect(blocker.enableBeforeUnload).toBe(false);
  });
});
