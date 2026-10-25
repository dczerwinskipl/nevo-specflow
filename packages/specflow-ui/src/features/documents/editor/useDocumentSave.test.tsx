// @vitest-environment jsdom
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import type { DocumentContent } from '@nevo/specflow-contracts/documents';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClientError } from '@nevo/http-client';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createDocumentDraftStore, type DocumentDraft } from './documentDraftStore';
import { DocumentDraftProvider } from './DocumentDraftProvider';
import type { DocumentsApi } from '../api';
import { documentKeys } from '../read-model/queries';
import { useDocumentSave } from './useDocumentSave';
import { DocumentEditorProvider, useDocumentSaveOwner } from './DocumentEditorProvider';

/** Every save carries a fresh `operationId` (idempotency key). */
const anyOperationId: unknown = expect.any(String);

afterEach(cleanup);

const SPEC = 'spec';
const draft = (content: string, baseline: string, revision: string): DocumentDraft => ({
  content,
  baseline,
  revision,
  editing: false,
});
const record = (id: string): DocumentContent =>
  documentContentFixture({
    id,
    title: id,
    path: `${id}.md`,
    content: `${id}0`,
    revision: `${id}1`,
  });

function setup(failIds: string[] = []) {
  const queryClient = createSpecFlowQueryClient();
  for (const id of ['a', 'b', 'c'])
    queryClient.setQueryData(documentKeys.detail(SPEC, id), record(id));
  const save = vi.fn((_spec: string, id: string) => {
    if (failIds.includes(id)) return Promise.reject(new Error(`fail ${id}`));
    return Promise.resolve({ revision: `${id}2` });
  });
  const services = createSpecFlowAppServices({
    demoDocumentsApi: { save } as unknown as DocumentsApi,
  });
  const store = createDocumentDraftStore();
  store.set(SPEC, 'a', draft('A1', 'a0', 'a1'));
  store.set(SPEC, 'b', draft('B1', 'b0', 'b1'));
  store.set(SPEC, 'c', draft('C1', 'c0', 'c1'));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <DocumentDraftProvider store={store}>{children}</DocumentDraftProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  // The shown document is "a"; the others are not loaded as records.
  const view = renderHook(
    () => useDocumentSave({ specId: SPEC, document: record('a'), draft: store.get(SPEC, 'a') }),
    { wrapper },
  );
  return { save, store, view, queryClient };
}

describe('useDocumentSave for any document', () => {
  it('saves a non-active document from its draft revision and content', async () => {
    const { save, store, view } = setup();
    await act(async () => {
      expect(await view.result.current.save('b')).toMatchObject({ ok: true, documentId: 'b' });
    });
    expect(save).toHaveBeenCalledWith(SPEC, 'b', {
      operationId: anyOperationId,
      content: 'B1',
      expectedRevision: 'b1',
    });
    expect(store.get(SPEC, 'b')).toMatchObject({ baseline: 'B1', revision: 'b2' });
    expect(store.get(SPEC, 'a')).toMatchObject({ baseline: 'a0' });
  });

  it('defaults to the shown document', async () => {
    const { save, view } = setup();
    await act(async () => void (await view.result.current.save()));
    expect(save).toHaveBeenCalledWith(SPEC, 'a', {
      operationId: anyOperationId,
      content: 'A1',
      expectedRevision: 'a1',
    });
  });

  it('reports saving and error per document', async () => {
    const { view } = setup(['b']);
    await act(async () => void (await view.result.current.save('b')));
    expect(view.result.current.errorOf('b')).toBeInstanceOf(Error);
    expect(view.result.current.errorOf('c')).toBeUndefined();
    expect(view.result.current.savingOf('b')).toBe(false);
    expect(view.result.current.saveError).toBeUndefined();
  });

  it('saves all sequentially', async () => {
    const { save, view } = setup();
    let result: Awaited<ReturnType<typeof view.result.current.saveAll>> | undefined;
    await act(async () => {
      result = await view.result.current.saveAll(['b', 'c']);
    });
    expect(result).toEqual({ saved: ['b', 'c'], failed: [], skipped: [] });
    expect(save.mock.calls.map((call) => call[1])).toEqual(['b', 'c']);
  });

  it('stops at the first failure', async () => {
    const { save, view } = setup(['b']);
    let result: Awaited<ReturnType<typeof view.result.current.saveAll>> | undefined;
    await act(async () => {
      result = await view.result.current.saveAll(['a', 'b', 'c']);
    });
    expect(result?.saved).toEqual(['a']);
    expect(result?.failed).toHaveLength(1);
    expect(result?.failed[0]).toMatchObject({ id: 'b' });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('skips an id whose draft disappears during the series', async () => {
    const { save, store, view } = setup();
    save.mockImplementationOnce((_spec: string, id: string) => {
      store.remove(SPEC, 'c');
      return Promise.resolve({ revision: `${id}2` });
    });
    let result: Awaited<ReturnType<typeof view.result.current.saveAll>> | undefined;
    await act(async () => {
      result = await view.result.current.saveAll(['b', 'c']);
    });
    expect(result).toEqual({ saved: ['b'], failed: [], skipped: ['c'] });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('counts a clean document in the middle as saved without a request', async () => {
    const { save, store, view } = setup();
    store.set(SPEC, 'b', draft('b0', 'b0', 'b1'));
    let result: Awaited<ReturnType<typeof view.result.current.saveAll>> | undefined;
    await act(async () => {
      result = await view.result.current.saveAll(['a', 'b', 'c']);
    });
    expect(result).toEqual({ saved: ['a', 'b', 'c'], failed: [], skipped: [] });
    expect(save.mock.calls.map((call) => call[1])).toEqual(['a', 'c']);
  });

  it('joins concurrent saves of the same non-shown document into one request', async () => {
    const { save, view } = setup();
    await act(async () => {
      const [first, second] = await Promise.all([
        view.result.current.save('b'),
        view.result.current.save('b'),
      ]);
      expect(second).toBe(first);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps edits made during IO dirty after a non-shown save succeeds', async () => {
    const { store, view } = setup();
    await act(async () => {
      const pending = view.result.current.save('b');
      store.patch(SPEC, 'b', { content: 'B2' }, () => draft('B2', 'b0', 'b1'));
      await pending;
    });
    expect(store.get(SPEC, 'b')).toMatchObject({ content: 'B2', baseline: 'B1', revision: 'b2' });
    expect(store.dirtyIds(SPEC)).toContain('b');
  });

  it('does not recreate a draft removed while its save is in flight', async () => {
    const { save, store, view } = setup();
    save.mockImplementationOnce((_spec: string, id: string) => {
      store.remove(SPEC, id);
      return Promise.resolve({ revision: `${id}2` });
    });
    await act(async () => {
      await view.result.current.save('b');
    });
    expect(store.get(SPEC, 'b')).toBeUndefined();
  });

  it('does not reconcile an old save into a newly opened draft with the same id', async () => {
    const { save, store, view, queryClient } = setup();
    const reopened = draft('B reopened', 'b0', 'b1');
    save.mockImplementationOnce((_spec: string, id: string) => {
      store.remove(SPEC, id);
      store.set(SPEC, id, reopened);
      return Promise.resolve({ revision: `${id}2` });
    });
    await act(async () => {
      await view.result.current.save('b');
    });
    expect(store.get(SPEC, 'b')).toBe(reopened);
    expect(queryClient.getQueryData(documentKeys.detail(SPEC, 'b'))).toEqual(record('b'));
  });

  it('reads the latest stored draft of the shown document during a batch', async () => {
    const { save, store, view } = setup();
    save.mockImplementationOnce((_spec: string, id: string) => {
      // No React commit is required to make the store's new content authoritative.
      store.patch(SPEC, 'a', { content: 'A2' }, () => draft('A2', 'a0', 'a1'));
      return Promise.resolve({ revision: `${id}2` });
    });
    await act(async () => {
      await view.result.current.saveAll(['b', 'a']);
    });
    expect(save).toHaveBeenNthCalledWith(2, SPEC, 'a', {
      operationId: anyOperationId,
      content: 'A2',
      expectedRevision: 'a1',
    });
  });

  it('deduplicates batch ids while retaining their original order', async () => {
    const { save, view } = setup();
    await act(async () => {
      expect(await view.result.current.saveAll(['b', 'b', 'c'])).toEqual({
        saved: ['b', 'c'],
        failed: [],
        skipped: [],
      });
    });
    expect(save.mock.calls.map((call) => call[1])).toEqual(['b', 'c']);
  });

  it('exposes the same save owner without an active editor session', async () => {
    const queryClient = createSpecFlowQueryClient();
    const save = vi.fn(() => Promise.resolve({ revision: 'b2' }));
    const services = createSpecFlowAppServices({
      demoDocumentsApi: { save } as unknown as DocumentsApi,
    });
    const store = createDocumentDraftStore();
    store.set(SPEC, 'b', draft('B1', 'b0', 'b1'));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TestServicesRouterContext services={services}>
          <LocalizationProvider instance={createSpecFlowI18n('en')}>
            <DocumentDraftProvider store={store}>
              <DocumentEditorProvider specId={SPEC}>{children}</DocumentEditorProvider>
            </DocumentDraftProvider>
          </LocalizationProvider>
        </TestServicesRouterContext>
      </QueryClientProvider>
    );
    const view = renderHook(() => useDocumentSaveOwner(), { wrapper });
    await act(async () => {
      expect(await view.result.current.saveAll(['b'])).toEqual({
        saved: ['b'],
        failed: [],
        skipped: [],
      });
    });
    expect(save).toHaveBeenCalledWith(SPEC, 'b', {
      operationId: anyOperationId,
      content: 'B1',
      expectedRevision: 'b1',
    });
  });
});

const coded = (code: string) =>
  new HttpClientError(code, { kind: 'http', status: 503, data: { error: code, code } });

describe('a save that must be resumed or follows a new id', () => {
  it('resumes a written but uncommitted save with the same operation id and content', async () => {
    const { save, view } = setup();
    save.mockImplementationOnce(() => Promise.reject(coded('DOCUMENT_RECOVERY_REQUIRED')));
    await act(async () => void (await view.result.current.save('b')));
    expect(view.result.current.errorOf('b')).toBeDefined();
    // An operation that would change the document's id is refused meanwhile (see the tree ops).
    expect(view.result.current.pendingOf('b')).toBe('recovery');
    // Resume replays exactly what was written.
    await act(async () => void (await view.result.current.save('b', { resume: true })));
    const [first, second] = save.mock.calls.map(
      (call) => (call as unknown[])[2] as { operationId: string; content: string },
    );
    expect(second).toEqual(first);
    expect(second?.content).toBe('B1');
    expect(view.result.current.errorOf('b')).toBeUndefined();
    expect(view.result.current.pendingOf('b')).toBeUndefined();
  });

  it('replays a save whose answer was lost with the same operation id and revision', async () => {
    const { save, view } = setup();
    save.mockImplementationOnce(() =>
      Promise.reject(new HttpClientError('reset', { kind: 'network' })),
    );
    await act(async () => void (await view.result.current.save('b')));
    await act(async () => void (await view.result.current.save('b')));
    const [first, second] = save.mock.calls.map(
      (call) =>
        (call as unknown[])[2] as {
          operationId: string;
          content: string;
          expectedRevision: string;
        },
    );
    // The server may have committed the first one: the retry is the same operation.
    expect(second).toEqual(first);
    expect(view.result.current.errorOf('b')).toBeUndefined();
    // Settled: a later edit is a new operation.
    await act(async () => void (await view.result.current.save('b')));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('starts a new save after an unknown outcome once the text changed', async () => {
    const { save, store, view } = setup();
    save.mockImplementationOnce(() =>
      Promise.reject(new HttpClientError('reset', { kind: 'network' })),
    );
    await act(async () => void (await view.result.current.save('b')));
    store.update(SPEC, 'b', (current) => (current ? { ...current, content: 'B2' } : current));
    await act(async () => void (await view.result.current.save('b')));
    const [first, second] = save.mock.calls.map(
      (call) => (call as unknown[])[2] as { operationId: string; content: string },
    );
    expect(second?.content).toBe('B2');
    expect(second?.operationId).not.toBe(first?.operationId);
  });

  it('forgets a save to resume once the draft was discarded (no request for a clean draft)', async () => {
    const { save, store, view } = setup();
    save.mockImplementationOnce(() => Promise.reject(coded('DOCUMENT_RECOVERY_REQUIRED')));
    await act(async () => void (await view.result.current.save('b')));
    expect(view.result.current.pendingOf('b')).toBe('recovery');
    // Discard: the draft is back at its baseline.
    store.update(SPEC, 'b', (current) =>
      current ? { ...current, content: current.baseline } : current,
    );
    expect(view.result.current.pendingOf('b')).toBeUndefined();
    await act(async () => {
      expect(await view.result.current.save('b')).toMatchObject({ ok: true });
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves a new edit made after a save to resume as a new operation, not the old text', async () => {
    const { save, store, view } = setup();
    save.mockImplementationOnce(() => Promise.reject(coded('DOCUMENT_RECOVERY_REQUIRED')));
    await act(async () => void (await view.result.current.save('b')));
    // The draft was reloaded and edited again (for example after the tab was closed and reopened).
    store.remove(SPEC, 'b');
    store.set(SPEC, 'b', draft('B3', 'b0', 'b5'));
    await act(async () => void (await view.result.current.save('b')));
    const [first, second] = save.mock.calls.map(
      (call) =>
        (call as unknown[])[2] as {
          operationId: string;
          content: string;
          expectedRevision: string;
        },
    );
    expect(second).toMatchObject({ content: 'B3', expectedRevision: 'b5' });
    expect(second?.operationId).not.toBe(first?.operationId);
  });

  it("moves a refused save (the conflict) to the document's new id", async () => {
    const { save, view } = setup();
    save.mockImplementationOnce(() => Promise.reject(coded('DOCUMENT_REVISION_CONFLICT')));
    await act(async () => void (await view.result.current.save('b')));
    expect(view.result.current.errorOf('b')).toBeDefined();
    act(() => view.result.current.follow('b', 'research'));
    expect(view.result.current.errorOf('b')).toBeUndefined();
    expect(view.result.current.errorOf('research')).toBeDefined();
  });
});
