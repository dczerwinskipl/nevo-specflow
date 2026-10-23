// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createDocumentDraftStore, type DocumentDraft } from './documentDraftStore';
import { DocumentDraftProvider } from './DocumentDraftProvider';
import type { DocumentsApi } from '../api';
import { documentKeys } from '../read-model/queries';
import { useDocumentSave } from './useDocumentSave';

afterEach(cleanup);

const SPEC = 'spec';
const draft = (content: string, baseline: string, revision: string): DocumentDraft => ({
  content,
  baseline,
  revision,
  editing: false,
});
const record = (id: string): SpecificationDocumentResponse => ({
  id,
  title: id,
  filename: `${id}.md`,
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
    documentsApi: { save } as unknown as DocumentsApi,
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
  return { save, store, view };
}

describe('useDocumentSave for any document', () => {
  it('saves a non-active document from its draft revision and content', async () => {
    const { save, store, view } = setup();
    await act(async () => {
      expect(await view.result.current.save('b')).toMatchObject({ ok: true, documentId: 'b' });
    });
    expect(save).toHaveBeenCalledWith(SPEC, 'b', { content: 'B1', expectedRevision: 'b1' });
    expect(store.get(SPEC, 'b')).toMatchObject({ baseline: 'B1', revision: 'b2' });
    expect(store.get(SPEC, 'a')).toMatchObject({ baseline: 'a0' });
  });

  it('defaults to the shown document', async () => {
    const { save, view } = setup();
    await act(async () => void (await view.result.current.save()));
    expect(save).toHaveBeenCalledWith(SPEC, 'a', { content: 'A1', expectedRevision: 'a1' });
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
});
