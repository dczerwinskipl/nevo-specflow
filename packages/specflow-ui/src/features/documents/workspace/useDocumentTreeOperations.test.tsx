// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentDraftStore } from '../editor/documentDraftStore';
import { DocumentDraftProvider } from '../editor/DocumentDraftProvider';
import { useDocumentOperations } from '../explorer/useDocumentOperations';
import { useDocumentTreeOperations } from './useDocumentTreeOperations';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addDocuments: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useBlocker: () => undefined,
}));
vi.mock('../../../app/navigation/ApplicationLocation', () => ({
  useApplicationCollection: () => 'current',
}));
vi.mock('../../../app/useAppServices', () => ({
  useAppServices: () => ({
    documentsApi: { addDocuments: mocks.addDocuments, operateDocument: vi.fn() },
    documentApi: { getDocument: mocks.getDocument },
  }),
}));

const emptyTree = {
  documents: [],
  folders: [],
  capabilities: {},
} as unknown as Parameters<typeof useDocumentOperations>[0]['tree'];

function render() {
  const cache = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>
      <DocumentDraftProvider store={createDocumentDraftStore()}>{children}</DocumentDraftProvider>
    </QueryClientProvider>
  );
  return renderHook(
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
}

describe('creating a file: mutation result is separate from the follow-up read', () => {
  beforeEach(() => {
    mocks.addDocuments.mockReset().mockResolvedValue({ documentIds: ['d1'] });
    mocks.getDocument.mockReset().mockRejectedValue(new TypeError('network down'));
    mocks.navigate.mockReset();
  });
  afterEach(cleanup);

  it('keeps a confirmed create confirmed when the follow-up GET fails, and never re-POSTs', async () => {
    const view = render();
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
    // The new file is still opened: the route loads it itself.
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});
