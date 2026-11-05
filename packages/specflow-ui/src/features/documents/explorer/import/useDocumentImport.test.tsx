// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { HttpClientError } from '@nevo/http-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentTreeFixture } from '../../../../../test-support/documents/fixtures';
import { NotificationProvider } from '../../../../shared/notifications/notifications';
import { useOperationLifecycle } from '../operationLifecycle';
import type { NewDocumentEntry } from '../operationTypes';
import { useDocumentImport } from './useDocumentImport';

afterEach(cleanup);

const tree = documentTreeFixture({ documents: [] });
const file = () => new File(['# A'], 'a.md');
const planned = [{ path: 'a.md', content: '# A' }];

function setup(onAdd: (documents: NewDocumentEntry[]) => Promise<void>) {
  return renderHook(
    () => {
      const lifecycle = useOperationLifecycle({});

      return { lifecycle, import: useDocumentImport({ tree, onAdd, lifecycle }) };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <NotificationProvider>{children}</NotificationProvider>
      ),
    },
  );
}

/** An answer that never came: the Runtime may have applied the import. */
const noAnswer = () => new HttpClientError('reset', { kind: 'network' });

describe('useDocumentImport', () => {
  it('sends the accepted files and leaves nothing to retry', async () => {
    const onAdd = vi.fn(() => Promise.resolve());
    const view = setup(onAdd);
    await act(() => view.result.current.import.importFiles([file()], ''));
    expect(onAdd).toHaveBeenCalledWith(planned);
    expect(view.result.current.import.retry).toEqual([]);
    expect(view.result.current.lifecycle.error).toBe('');
    expect(view.result.current.lifecycle.busy).toBe(false);
  });

  it('keeps the files of an import without an answer and locks until it is retried', async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(noAnswer()).mockResolvedValueOnce(undefined);
    const view = setup(onAdd);
    await act(() => view.result.current.import.importFiles([file()], ''));
    expect(view.result.current.import.retry).toEqual(planned);
    expect(view.result.current.lifecycle.unknown).toBe(true);
    expect(view.result.current.lifecycle.error).toBe('documents.tree.importUnconfirmed');

    await act(async () => {
      view.result.current.import.retryImport();
      await Promise.resolve();
    });
    expect(onAdd).toHaveBeenLastCalledWith(planned);
    expect(view.result.current.import.retry).toEqual([]);
    expect(view.result.current.lifecycle.unknown).toBe(false);
    expect(view.result.current.lifecycle.error).toBe('');
  });

  it('says so when the retried import is still unconfirmed', async () => {
    const onAdd = vi.fn().mockRejectedValue(noAnswer());
    const view = setup(onAdd);
    await act(() => view.result.current.import.importFiles([file()], ''));
    await act(async () => {
      view.result.current.import.retryImport();
      await Promise.resolve();
    });
    expect(view.result.current.import.retry).toEqual(planned);
    expect(view.result.current.lifecycle.error).toBe('documents.tree.importStillUnconfirmed');
  });

  it('drops the files of a definite refusal: the same batch would be refused again', async () => {
    const refusal = new HttpClientError('conflict', {
      kind: 'http',
      status: 409,
      data: { error: 'DOCUMENT_PATH_CONFLICT' },
    });
    const view = setup(vi.fn().mockRejectedValue(refusal));
    await act(() => view.result.current.import.importFiles([file()], ''));
    expect(view.result.current.import.retry).toEqual([]);
    expect(view.result.current.lifecycle.unknown).toBe(false);
    expect(view.result.current.lifecycle.error).toBe('documents.tree.importRejected');
  });

  it('offers to resume an import that was written but not committed', async () => {
    const recovery = new HttpClientError('recovery', {
      kind: 'http',
      status: 409,
      data: { error: 'DOCUMENT_RECOVERY_REQUIRED' },
    });
    const view = setup(vi.fn().mockRejectedValue(recovery));
    await act(() => view.result.current.import.importFiles([file()], ''));
    expect(view.result.current.import.retry).toEqual(planned);
    expect(view.result.current.lifecycle.resumable).toBe(true);
    expect(view.result.current.lifecycle.error).toBe('documents.tree.error.recovery');
  });
});
