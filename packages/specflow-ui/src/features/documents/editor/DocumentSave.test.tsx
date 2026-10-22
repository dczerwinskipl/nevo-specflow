// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, createRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createDocumentDraftStore } from './documentDraftStore';
import { DocumentDraftProvider } from './DocumentDraftProvider';
import type { DocumentsApi } from '../api';
import { documentKeys } from '../read-model/queries';
import {
  DocumentEditorProvider,
  documentHeaderModel,
  useDocumentEditor,
  type DocumentEditorSession,
} from './DocumentEditorProvider';
import { DocumentRouteGuard } from './DocumentRouteGuard';

const SPEC = 'spec';

function record(id: string, content: string, revision: string): SpecificationDocumentResponse {
  return {
    id,
    title: id,
    filename: `${id}.md`,
    content,
    revision,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const conflict = () =>
  new HttpClientError('Conflict', {
    kind: 'http',
    status: 409,
    data: { error: 'demo_document_revision_conflict' },
  });

interface Controls {
  session: DocumentEditorSession | null;
  leave: RefObject<(() => Promise<boolean>) | null>;
}

type SaveCall = Parameters<DocumentsApi['save']>;

function setup({ strict = false }: { strict?: boolean } = {}) {
  const docs = { a: record('a', 'A0', 'a1'), b: record('b', 'B0', 'b1') };
  const queryClient: QueryClient = createSpecFlowQueryClient();
  for (const doc of Object.values(docs))
    queryClient.setQueryData(documentKeys.detail(SPEC, doc.id), doc);
  const calls: SaveCall[] = [];
  const pendingSaves: Deferred<{ revision: string }>[] = [];
  const save = vi.fn((...args: SaveCall) => {
    calls.push(args);
    const next = deferred<{ revision: string }>();
    pendingSaves.push(next);
    return next.promise;
  });
  const services = createSpecFlowAppServices({
    documentsApi: { save } as unknown as DocumentsApi,
  });
  const store = createDocumentDraftStore();
  const controls: Controls = { session: null, leave: createRef() };
  let go: (id: 'a' | 'b') => void = () => undefined;

  function Panel() {
    const session = useDocumentEditor();
    const { t } = useTranslation();
    controls.session = session;
    const actions = documentHeaderModel(session, t).actions;
    const saveAction = actions.find((action) => action.id === 'document-save');
    return (
      <div>
        <output data-testid="content">{session?.draft.content}</output>
        <output data-testid="saving">{String(session?.saving)}</output>
        <output data-testid="error">{session?.saveError === undefined ? 'none' : 'error'}</output>
        <button
          type="button"
          disabled={saveAction?.disabled}
          onClick={() => saveAction?.onPress?.()}
        >
          header-save
        </button>
        <button type="button" onClick={() => go('a')}>
          open-a
        </button>
        <button type="button" onClick={() => go('b')}>
          open-b
        </button>
      </div>
    );
  }
  function Harness() {
    const [id, setId] = useState<'a' | 'b'>('a');
    go = setId;
    const document = docs[id];
    return (
      <DocumentEditorProvider specId={SPEC} document={document}>
        <DocumentRouteGuard specId={SPEC} documentId={id} requestRef={controls.leave} />
        <Panel />
      </DocumentEditorProvider>
    );
  }
  const tree = (
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <DocumentDraftProvider store={store}>
            <Harness />
          </DocumentDraftProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  const type = (content: string) =>
    act(() => {
      controls.session!.setDraft({ content });
    });
  const edit = () =>
    act(() => {
      controls.session!.setDraft({ editing: true });
    });
  const settle = (fn: () => void) =>
    act(async () => {
      fn();
      await Promise.resolve();
    });
  const clickSave = () =>
    settle(() => {
      fireEvent.click(screen.getByText('header-save'));
    });
  const open = (id: 'a' | 'b') => fireEvent.click(screen.getByText(`open-${id}`));
  const draftOf = (id: 'a' | 'b') => store.get(SPEC, id);
  const cached = (id: 'a' | 'b') =>
    queryClient.getQueryData<SpecificationDocumentResponse>(documentKeys.detail(SPEC, id));
  return {
    save,
    calls,
    pendingSaves,
    controls,
    type,
    edit,
    clickSave,
    settle,
    open,
    draftOf,
    cached,
    queryClient,
  };
}

afterEach(cleanup);

describe('document save identity', () => {
  it('applies a late response for A to A only, never to the document open by then', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    await t.clickSave();
    expect(t.calls).toEqual([[SPEC, 'a', { content: 'A1', expectedRevision: 'a1' }]]);

    t.open('b');
    t.edit();
    t.type('B1');
    expect(screen.getByTestId('content').textContent).toBe('B1');
    expect(screen.getByTestId('saving').textContent).toBe('false');

    await t.settle(() => t.pendingSaves[0]!.resolve({ revision: 'a2' }));

    expect(screen.getByTestId('content').textContent).toBe('B1');
    expect(t.draftOf('b')).toMatchObject({ content: 'B1', baseline: 'B0', revision: 'b1' });
    expect(t.cached('b')).toMatchObject({ content: 'B0', revision: 'b1' });
    expect(t.cached('a')).toMatchObject({ content: 'A1', revision: 'a2' });
    expect(t.draftOf('a')).toMatchObject({ content: 'A1', baseline: 'A1', revision: 'a2' });
  });

  it('keeps the document unchanged when a late response arrives after a discard in B', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    await t.clickSave();
    t.open('b');
    t.edit();
    t.type('B1');
    act(() => t.controls.session!.requestDiscard());
    fireEvent.click(await screen.findByText('Discard changes'));
    await waitFor(() => expect(t.draftOf('b')).toMatchObject({ content: 'B0' }));

    await t.settle(() => t.pendingSaves[0]!.resolve({ revision: 'a2' }));

    expect(t.draftOf('b')).toMatchObject({ content: 'B0', baseline: 'B0', revision: 'b1' });
    expect(t.cached('b')).toMatchObject({ content: 'B0', revision: 'b1' });
    expect(t.cached('a')).toMatchObject({ content: 'A1', revision: 'a2' });
  });

  it('preserves edits made while the save was in flight and stays dirty', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    await t.clickSave();
    t.type('A2');
    await t.settle(() => t.pendingSaves[0]!.resolve({ revision: 'a2' }));

    expect(t.draftOf('a')).toMatchObject({ content: 'A2', baseline: 'A1', revision: 'a2' });
    expect(t.controls.session!.dirty).toBe(true);
    expect(t.cached('a')).toMatchObject({ content: 'A1', revision: 'a2' });
  });

  it('merges into the cached record instead of replacing it', async () => {
    const t = setup();
    t.queryClient.setQueryData(documentKeys.detail(SPEC, 'a'), {
      ...record('a', 'A0', 'a1'),
      title: 'Cached title',
    });
    t.edit();
    t.type('A1');
    await t.clickSave();
    await t.settle(() => t.pendingSaves[0]!.resolve({ revision: 'a2' }));
    expect(t.cached('a')).toMatchObject({ title: 'Cached title', content: 'A1', revision: 'a2' });
  });
});

describe('one save owner', () => {
  it('sends one request for the header action and the keyboard shortcut together', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    await t.settle(() => {
      fireEvent.click(screen.getByText('header-save'));
      void t.controls.session!.save();
    });
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('saving').textContent).toBe('true');
    await t.settle(() => t.pendingSaves[0]!.resolve({ revision: 'a2' }));
    expect(screen.getByTestId('saving').textContent).toBe('false');
    expect(t.save).toHaveBeenCalledTimes(1);
  });

  it('routes the leave dialog save through the same operation and releases the departure', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    let departure!: Promise<boolean>;
    await t.settle(() => {
      departure = t.controls.leave.current!();
    });
    const dialogSave = await screen.findByText('Save and continue');
    await t.settle(() => {
      fireEvent.click(screen.getByText('header-save'));
      fireEvent.click(dialogSave);
    });
    expect(t.save).toHaveBeenCalledTimes(1);
    await t.settle(() => t.pendingSaves[0]!.resolve({ revision: 'a2' }));
    await expect(departure).resolves.toBe(true);
    expect(t.draftOf('a')).toMatchObject({ baseline: 'A1', revision: 'a2' });
  });

  it('settles every overlapping leave request with the one dialog decision', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    const settled: boolean[] = [];
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await t.settle(() => {
      first = t.controls.leave.current!();
      second = t.controls.leave.current!();
      void first.then((value) => settled.push(value));
      void second.then((value) => settled.push(value));
    });
    expect(screen.getAllByText('Save and continue')).toHaveLength(1);
    await t.settle(() => fireEvent.click(screen.getByText('Discard changes')));
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(settled).toEqual([true, true]);
  });

  it('settles a pending leave request when the guard unmounts', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    let pending!: Promise<boolean>;
    await t.settle(() => {
      pending = t.controls.leave.current!();
    });
    cleanup();
    await expect(pending).resolves.toBe(false);
  });

  it('does not save twice or lose state under StrictMode', async () => {
    const t = setup({ strict: true });
    t.edit();
    t.type('A1');
    await t.settle(() => {
      fireEvent.click(screen.getByText('header-save'));
      void t.controls.session!.save();
    });
    expect(t.save).toHaveBeenCalledTimes(1);
    await t.settle(() => t.pendingSaves[0]!.resolve({ revision: 'a2' }));
    expect(t.draftOf('a')).toMatchObject({ content: 'A1', baseline: 'A1', revision: 'a2' });
    expect(t.save).toHaveBeenCalledTimes(1);
  });
});

describe('save failure and retry', () => {
  it('surfaces a revision conflict through the owner, keeps the draft and revision', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    await t.clickSave();
    await t.settle(() => t.pendingSaves[0]!.reject(conflict()));

    expect(screen.getByTestId('error').textContent).toBe('error');
    expect(screen.getByTestId('saving').textContent).toBe('false');
    expect(t.draftOf('a')).toMatchObject({ content: 'A1', baseline: 'A0', revision: 'a1' });
    expect(t.cached('a')).toMatchObject({ content: 'A0', revision: 'a1' });
  });

  it('retries through the same owner and clears the error on success', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    await t.clickSave();
    await t.settle(() => t.pendingSaves[0]!.reject(new Error('offline')));
    expect(screen.getByTestId('error').textContent).toBe('error');

    await t.clickSave();
    expect(screen.getByTestId('error').textContent).toBe('none');
    expect(t.calls[1]).toEqual([SPEC, 'a', { content: 'A1', expectedRevision: 'a1' }]);
    await t.settle(() => t.pendingSaves[1]!.resolve({ revision: 'a2' }));
    expect(t.draftOf('a')).toMatchObject({ baseline: 'A1', revision: 'a2' });
    expect(t.save).toHaveBeenCalledTimes(2);
  });

  it('keeps a failure that lands after navigation on the document it belongs to', async () => {
    const t = setup();
    t.edit();
    t.type('A1');
    await t.clickSave();
    t.open('b');
    await t.settle(() => t.pendingSaves[0]!.reject(new Error('network')));

    expect(screen.getByTestId('error').textContent).toBe('none');
    expect(screen.getByTestId('saving').textContent).toBe('false');
    expect(t.draftOf('b')).toBeUndefined();
    expect(t.cached('b')).toMatchObject({ content: 'B0', revision: 'b1' });

    t.open('a');
    expect(screen.getByTestId('error').textContent).toBe('error');
    expect(t.draftOf('a')).toMatchObject({ content: 'A1', baseline: 'A0', revision: 'a1' });
  });
});
