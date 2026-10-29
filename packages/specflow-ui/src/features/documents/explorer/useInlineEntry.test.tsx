// @vitest-environment jsdom
import type { ReactNode } from 'react';
import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { act, cleanup, renderHook } from '@testing-library/react';
import { HttpClientError } from '@nevo/http-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  documentTreeFixture,
  folderRevisionFixture,
} from '../../../../test-support/documents/fixtures';
import { NotificationProvider } from '../../../shared/notifications/notifications';
import { useDocumentOperations, type DocumentOperation } from './useDocumentOperations';
import { useInlineEntry } from './useInlineEntry';
import type { TreeFocus } from './useTreeFocus';

afterEach(cleanup);

const tree = documentTreeFixture({
  revision: 'tree-7',
  folders: ['notes'],
  documents: [{ id: 'decisions', path: 'notes/decisions.md', revision: 'doc-3' }],
});

function setup(
  current: DocumentTree,
  operate: (input: DocumentOperation) => Promise<void> = () => Promise.resolve(),
) {
  const onOperate = vi.fn(operate);
  const focus: TreeFocus = { register: () => () => undefined, request: () => undefined };
  const view = renderHook(
    () => {
      const operations = useDocumentOperations({
        tree: current,
        onAdd: () => Promise.resolve(),
        onOperate,
      });

      return {
        inline: useInlineEntry({
          operations: operations.actions,
          focus,
          onOpenFolder: () => undefined,
        }),
        error: operations.state.error,
      };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NotificationProvider>{children}</NotificationProvider>
      ),
    },
  );
  const rename = async (kind: 'document' | 'folder', path: string, name: string, id?: string) => {
    await act(async () => {
      view.result.current.inline.start(kind, '', { id, path });
      await Promise.resolve();
    });
    if (!view.result.current.inline.entry) {
      return;
    }

    act(() => view.result.current.inline.change(name));
    await act(() => view.result.current.inline.commit('enter'));
  };

  return { view, onOperate, rename };
}

describe('inline rename', () => {
  it('sends the FOLDER revision for a folder, never the tree revision', async () => {
    const { onOperate, rename } = setup(tree);
    await rename('folder', 'notes', 'archive');
    expect(onOperate).toHaveBeenCalledWith({
      action: 'rename',
      kind: 'folder',
      path: 'notes',
      name: 'archive',
      expectedRevision: folderRevisionFixture('notes'),
    });
    expect(onOperate.mock.calls[0]![0].expectedRevision).not.toBe(tree.revision);
  });

  it('sends the document revision for a document', async () => {
    const { onOperate, rename } = setup(tree);
    await rename('document', 'notes/decisions.md', 'choices.md', 'decisions');
    expect(onOperate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'document',
        documentId: 'decisions',
        expectedRevision: 'doc-3',
      }),
    );
  });

  it('does not start a folder rename when the folder has no revision', async () => {
    const withoutRevision: DocumentTree = {
      ...tree,
      folders: tree.folders.map(({ revision: _revision, ...folder }) => folder),
    };
    const { view, onOperate, rename } = setup(withoutRevision);
    await rename('folder', 'notes', 'archive');
    expect(view.result.current.inline.entry).toBeUndefined();
    expect(onOperate).not.toHaveBeenCalled();
    // Not silent: the reason is shown under the tree.
    expect(view.result.current.error).toBe('documents.tree.error.folderRevisionMissing');
  });

  it('explains a case-only rename the file system refuses and keeps the typed name', async () => {
    const caseOnly = new HttpClientError('Bad Request', {
      kind: 'http',
      status: 400,
      data: {
        error: 'DOCUMENT_OPERATION_INVALID',
        code: 'DOCUMENT_OPERATION_INVALID',
        details: { cause: 'case-only-rename' },
      },
    });
    const { view, onOperate, rename } = setup(tree, () => Promise.reject(caseOnly));
    await rename('document', 'notes/decisions.md', 'Decisions.md', 'decisions');
    expect(onOperate).toHaveBeenCalledTimes(1);
    expect(view.result.current.inline.entry).toMatchObject({
      name: 'Decisions.md',
      error: 'documents.tree.error.caseOnlyRename',
    });
  });
});
