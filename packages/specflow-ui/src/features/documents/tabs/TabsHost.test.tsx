// @vitest-environment jsdom
import {
  documentContentFixture,
  documentTreeFixture,
} from '../../../../test-support/documents/fixtures';
import type { DocumentContent, DocumentTree } from '@nevo/specflow-contracts/documents';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import type { DocumentApi, DocumentsApi } from '../api';
import { DocumentDraftProvider } from '../editor/DocumentDraftProvider';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';
import { DocumentRouteGuard } from '../editor/DocumentRouteGuard';
import { createDocumentDraftStore, type DocumentDraftStore } from '../editor/documentDraftStore';
import { DocumentTabsProvider, useDocumentTabs } from './DocumentTabsProvider';

/** Every save carries a fresh `operationId` (idempotency key). */
const anyOperationId: unknown = expect.any(String);

const SPEC = 'spec';
const names = { a: 'a.md', b: 'b.md', c: 'c.md' } as const;
type Id = keyof typeof names;

const record = (id: Id): DocumentContent =>
  documentContentFixture({
    id,
    title: id,
    path: `docs/${names[id]}`,
    content: `${id.toUpperCase()}0`,
    revision: `${id}1`,
  });

function tree(ids: readonly Id[]): DocumentTree {
  return documentTreeFixture({
    revision: 't',
    documents: ids.map((id) => ({ id, path: `docs/${names[id]}`, revision: `${id}1` })),
  });
}

function setup({
  initial = `/specs/${SPEC}/documents/a`,
  strict = false,
  state,
  store = createDocumentDraftStore(),
  failSave = [],
}: {
  initial?: string;
  strict?: boolean;
  state?: Record<string, unknown>;
  store?: DocumentDraftStore;
  failSave?: Id[];
} = {}) {
  const getDocument = vi.fn((_spec: string, id: string) => Promise.resolve(record(id as Id)));
  const save = vi.fn((_spec: string, id: string) =>
    failSave.includes(id as Id)
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ document: { revision: `${id}2` } }),
  );
  const services = createSpecFlowAppServices({
    documentApi: { getDocument } as unknown as DocumentApi,
    demoDocumentsApi: {
      documentTree: () => Promise.resolve(tree(treeIds)),
      save,
    } as unknown as DocumentsApi,
  });
  const leave = createRef<(() => Promise<boolean>) | null>() as {
    current: (() => Promise<boolean>) | null;
  };
  const commit = createRef<(() => void) | null>() as { current: (() => void) | null };
  const seen: {
    tabs?: ReturnType<typeof useDocumentTabs>;
    session?: ReturnType<typeof useDocumentEditor>;
  } = {};
  const treeIds: Id[] = ['a', 'b', 'c'];

  function Probe() {
    const tabs = useDocumentTabs();
    const session = useDocumentEditor();
    seen.tabs = tabs;
    seen.session = session;

    return (
      <div>
        <output data-testid="active">{tabs.activeId ?? 'none'}</output>
        <output data-testid="tabs">
          {tabs.tabs.map((tab) => `${tab.id}:${tab.state}${tab.dirty ? '*' : ''}`).join(',')}
        </output>
        <output data-testid="failed">{String(tabs.closeFailed)}</output>
        <output data-testid="busy">{String(tabs.closeBusy)}</output>
        <output data-testid="content">{session?.draft.content ?? '-'}</output>
        <button type="button" onClick={() => session?.setDraft({ content: 'EDIT', editing: true })}>
          edit-active
        </button>
        {(['a', 'b', 'c'] as const).map((id) => (
          <span key={id}>
            <button type="button" onClick={() => void tabs.show(id)}>
              show-{id}
            </button>
            <button type="button" onClick={() => void tabs.requestClose(id)}>
              close-{id}
            </button>
          </span>
        ))}
        <button type="button" onClick={() => void tabs.closeAll()}>
          close-all
        </button>
        <button type="button" onClick={() => void tabs.removeTabs(['b'])}>
          remove-b
        </button>
      </div>
    );
  }

  function Screen() {
    const { documentId } = useParams({ strict: false });

    return (
      <DocumentTabsProvider specId={SPEC} documentId={documentId}>
        <DocumentRouteGuard specId={SPEC} requestRef={leave} commitRef={commit} />
        <Probe />
      </DocumentTabsProvider>
    );
  }

  const root = createRootRoute();
  const specification = createRoute({ getParentRoute: () => root, path: 'specs/$specId' });
  const layout = createRoute({
    getParentRoute: () => specification,
    id: 'documents-layout',
    component: Screen,
  });
  const list = createRoute({ getParentRoute: () => layout, path: 'documents' });
  const detail = createRoute({ getParentRoute: () => layout, path: 'documents/$documentId' });
  const elsewhere = createRoute({
    getParentRoute: () => root,
    path: 'elsewhere',
    component: () => <p>elsewhere</p>,
  });
  const history = createMemoryHistory({ initialEntries: [initial] });
  if (state) {
    history.replace(initial, state);
  }

  const router = createRouter({
    routeTree: root.addChildren([
      specification.addChildren([layout.addChildren([list, detail])]),
      elsewhere,
    ]),
    history,
    context: { services },
  });
  const queryClient = createSpecFlowQueryClient();
  const app = (
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <DocumentDraftProvider store={store}>
          <RouterProvider router={router as never} />
        </DocumentDraftProvider>
      </LocalizationProvider>
    </QueryClientProvider>
  );
  render(strict ? <StrictMode>{app}</StrictMode> : app);
  const click = (name: string) =>
    act(async () => {
      fireEvent.click(screen.getByText(name));
      await Promise.resolve();
    });
  const text = (id: string) => screen.getByTestId(id).textContent;

  return {
    router,
    history,
    store,
    save,
    getDocument,
    leave,
    commit,
    seen,
    click,
    text,
    treeIds,
    queryClient,
  };
}

const ready = async (t: ReturnType<typeof setup>, active: string) =>
  waitFor(() => {
    expect(t.text('active')).toBe(active);
    expect(t.text('content')).not.toBe('-');
  });

beforeAll(() => {
  // jsdom has no layout: the router's scroll restoration only needs the call to exist.
  window.scrollTo = () => undefined;
});
afterEach(cleanup);

describe('tabs follow the route', () => {
  it('opens exactly one tab for a deep link, and again under StrictMode', async () => {
    for (const strict of [false, true]) {
      const t = setup({ strict });
      await ready(t, 'a');
      expect(t.text('tabs')).toBe('a:ready');
      cleanup();
    }
  });

  it('opens a new tab with a push and switches to an open one with a replace', async () => {
    const t = setup();
    await ready(t, 'a');
    const length = t.history.length;
    await t.click('show-b');
    await ready(t, 'b');
    expect(t.text('tabs')).toBe('a:ready,b:ready');
    expect(t.history.length).toBe(length + 1);
    await t.click('show-a');
    await ready(t, 'a');
    expect(t.history.length).toBe(length + 1);
    expect(t.text('tabs')).toBe('a:ready,b:ready');
  });

  it('keeps the Session return state across tab changes', async () => {
    const t = setup({ state: { specflowDocumentReturnTo: 'overview' } });
    await ready(t, 'a');
    await t.click('show-b');
    await ready(t, 'b');
    expect(t.router.state.location.state).toMatchObject({ specflowDocumentReturnTo: 'overview' });
    await t.click('show-a');
    await ready(t, 'a');
    expect(t.router.state.location.state).toMatchObject({ specflowDocumentReturnTo: 'overview' });
  });

  it('shows a clean tab of an open document through the draft store without a second request', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('show-a');
    await ready(t, 'a');
    expect(t.getDocument).toHaveBeenCalledTimes(2);
  });
});

describe('tabs keep the state of their documents', () => {
  it('keeps content and view state of a tab while another tab is shown', async () => {
    const t = setup();
    await ready(t, 'a');
    const viewState = { anchor: 3, head: 5, scrollTop: 120, scrollLeft: 0 };
    await t.click('edit-active');
    act(() => t.seen.session!.setDraft({ viewState }));
    await t.click('show-b');
    await ready(t, 'b');
    expect(t.store.get(SPEC, 'a')).toMatchObject({ content: 'EDIT', editing: true, viewState });
    await t.click('show-a');
    await ready(t, 'a');
    expect(t.text('content')).toBe('EDIT');
    expect(t.store.get(SPEC, 'a')?.viewState).toEqual(viewState);
  });

  it('keeps a tab open as missing, with its draft, when its document disappears', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    t.treeIds.splice(0, t.treeIds.length, 'b', 'c');
    await act(async () => {
      await t.queryClient.invalidateQueries();
    });
    await waitFor(() => expect(t.text('tabs')).toBe('a:missing*'));
    expect(t.store.get(SPEC, 'a')).toMatchObject({ content: 'EDIT' });
  });
});

describe('closing tabs', () => {
  it('closes the active tab by moving to its neighbour with a replace, then to the list', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('show-c');
    await ready(t, 'c');
    const length = t.history.length;
    await t.click('close-c');
    await ready(t, 'b');
    expect(t.text('tabs')).toBe('a:ready,b:ready');
    expect(t.history.length).toBe(length);
    await t.click('close-b');
    await ready(t, 'a');
    await t.click('close-a');
    await waitFor(() => expect(t.text('active')).toBe('none'));
    expect(t.text('tabs')).toBe('');
    expect(t.router.state.location.pathname).toBe(`/specs/${SPEC}/documents`);
  });

  it('closes a tab that is not active without moving the route', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('close-a');
    await waitFor(() => expect(t.text('tabs')).toBe('b:ready'));
    expect(t.text('active')).toBe('b');
  });

  it('closes every tab and shows the list', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('close-all');
    await waitFor(() => expect(t.text('tabs')).toBe(''));
    expect(t.router.state.location.pathname).toBe(`/specs/${SPEC}/documents`);
  });

  it('asks Save / Discard / Cancel for THAT tab and Cancel keeps it open', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    expect(t.text('tabs')).toBe('a:ready*,b:ready');
    await t.click('close-a');
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/a\.md has unsaved changes/)).toBeTruthy();
    await t.click('Keep editing');
    expect(t.text('tabs')).toBe('a:ready*,b:ready');
    expect(t.save).not.toHaveBeenCalled();
  });

  it('saves a tab that is not on screen from its draft and then closes it', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('close-a');
    await screen.findByRole('alertdialog');
    await t.click('Save changes');
    await waitFor(() => expect(t.text('tabs')).toBe('b:ready'));
    expect(t.save).toHaveBeenCalledWith(SPEC, 'a', {
      operationId: anyOperationId,
      content: 'EDIT',
      expectedRevision: 'a1',
    });
  });

  it('keeps the tab and the dialog when Save fails', async () => {
    const t = setup({ failSave: ['a'] });
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('close-a');
    await screen.findByRole('alertdialog');
    await t.click('Save changes');
    await screen.findByText('Unable to save. The draft is kept.');
    expect(t.text('tabs')).toBe('a:ready*');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('discards the draft, closes the tab, and a reopened document is clean', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('close-a');
    await screen.findByRole('alertdialog');
    await t.click('Discard changes');
    await waitFor(() => expect(t.text('tabs')).toBe('b:ready'));
    expect(t.store.get(SPEC, 'a')).toBeUndefined();
    await t.click('show-a');
    await ready(t, 'a');
    expect(t.text('content')).toBe('A0');
    expect(t.text('tabs')).toBe('b:ready,a:ready');
  });

  it('treats a guard that throws as a refusal and tells the user', async () => {
    const store = createDocumentDraftStore();
    const t = setup({ store });
    await ready(t, 'a');
    await t.click('show-b');
    await ready(t, 'b');
    const get = vi.spyOn(store, 'get').mockImplementation(() => {
      throw new Error('boom');
    });
    await t.click('close-a');
    await waitFor(() => expect(t.text('failed')).toBe('true'));
    expect(t.text('tabs')).toBe('a:ready,b:ready');
    get.mockRestore();
    await t.click('close-a');
    await waitFor(() => expect(t.text('tabs')).toBe('b:ready'));
    expect(t.text('failed')).toBe('false');
  });

  it('closes the tabs of removed documents without asking, moving to a surviving neighbour', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('show-c');
    await ready(t, 'c');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('remove-b');
    await ready(t, 'c');
    expect(t.text('tabs')).toBe('a:ready*,c:ready');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('closing when navigation or questions get in the way', () => {
  it('keeps the draft and the tab when Discard cannot leave the active tab', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('show-a');
    await ready(t, 'a');
    // The router refuses to move (a blocker, an error): the tab cannot step aside.
    const navigate = vi.spyOn(t.router, 'navigate').mockResolvedValue(undefined);
    await t.click('close-a');
    await screen.findByRole('alertdialog');
    await t.click('Discard changes');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(navigate).toHaveBeenCalled();
    expect(t.text('tabs')).toBe('a:ready*,b:ready');
    expect(t.store.get(SPEC, 'a')).toMatchObject({ content: 'EDIT' });
  });

  it('tells the user when a second close arrives while a question is open', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('edit-active');
    await t.click('close-a');
    await screen.findByRole('alertdialog');
    await t.click('close-b');
    await waitFor(() => expect(t.text('busy')).toBe('true'));
    // The first question is untouched; answering it works and clears the notice.
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    await t.click('Discard changes');
    await waitFor(() => expect(t.text('tabs')).toBe('b:ready*'));
    await t.click('close-b');
    await screen.findByRole('alertdialog');
    await t.click('Discard changes');
    await waitFor(() => expect(t.text('tabs')).toBe(''));
    expect(t.text('busy')).toBe('false');
  });

  it('clears the refusal notice once the open question is answered', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('edit-active');
    await t.click('close-a');
    await screen.findByRole('alertdialog');
    await t.click('close-b');
    await waitFor(() => expect(t.text('busy')).toBe('true'));
    await t.click('Keep editing');
    await waitFor(() => expect(t.text('busy')).toBe('false'));
    expect(t.text('tabs')).toBe('a:ready*,b:ready*');
  });

  it('does not leave a close hanging when the workspace goes away with a question open', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    let closing!: Promise<boolean>;
    await act(async () => {
      closing = t.seen.tabs!.requestClose('a');
      await Promise.resolve();
    });
    await screen.findByRole('alertdialog');
    cleanup();
    await expect(closing).resolves.toBe(false);
  });

  it('keeps the drafts of a Discard all whose departure did not happen', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    let asked!: Promise<boolean>;
    await act(async () => {
      asked = t.leave.current!();
      await Promise.resolve();
    });
    await screen.findByRole('alertdialog');
    await t.click('Discard all');
    await expect(asked).resolves.toBe(true);
    // Nothing left yet (the caller has not acted on the answer): the edit is still there.
    expect(t.store.get(SPEC, 'a')).toMatchObject({ content: 'EDIT' });
    act(() => t.commit.current!());
    expect(t.store.get(SPEC, 'a')).toBeUndefined();
  });

  it('reopens the tab of an address that the browser Back returns to after the tab was closed', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('show-c');
    await ready(t, 'c');
    await t.click('close-a');
    await waitFor(() => expect(t.text('tabs')).toBe('b:ready,c:ready'));
    act(() => t.history.back());
    act(() => t.history.back());
    await ready(t, 'a');
    // The route is the source of the active tab: an address always has its tab.
    expect(t.text('tabs')).toBe('b:ready,c:ready,a:ready');
  });
});

describe('leaving the screen', () => {
  it('lets tab switches inside the specification pass without a question', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('show-a');
    await ready(t, 'a');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(t.text('content')).toBe('EDIT');
  });

  it('asks ONCE with the list of unsaved documents and Discard all lets the departure go', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('edit-active');
    let leaving!: Promise<void>;
    await act(async () => {
      leaving = t.router.navigate({ to: '/elsewhere' as never });
      await Promise.resolve();
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    const items = within(dialog)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual(['a.md', 'b.md']);
    await t.click('Discard all');
    await act(() => leaving);
    // Discarding everything leaves no draft behind, not even a reset one.
    expect(t.store.get(SPEC, 'a')).toBeUndefined();
    expect(t.store.get(SPEC, 'b')).toBeUndefined();
    expect(t.router.state.location.pathname).toBe('/elsewhere');
  });

  it('keeps the dialog open and lists the failures when Save all cannot save everything', async () => {
    const t = setup({ failSave: ['b'] });
    await ready(t, 'a');
    await t.click('edit-active');
    await t.click('show-b');
    await ready(t, 'b');
    await t.click('edit-active');
    await act(async () => {
      void t.router.navigate({ to: '/elsewhere' as never });
      await Promise.resolve();
    });
    const dialog = await screen.findByRole('alertdialog');
    await t.click('Save all');
    await within(dialog).findByText('Not all documents could be saved. The drafts are kept.');
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['b.md (not saved)']);
    expect(t.router.state.location.pathname).not.toBe('/elsewhere');
    // Cancel keeps editing.
    await t.click('Keep editing');
    expect(t.router.state.location.pathname).toContain('/documents/b');
  });

  it('answers a tree operation or a close-all request through the same single dialog', async () => {
    const t = setup();
    await ready(t, 'a');
    await t.click('edit-active');
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = t.leave.current!();
      second = t.leave.current!();
      await Promise.resolve();
    });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    await t.click('Keep editing');
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });

  it('does not ask twice under StrictMode', async () => {
    const t = setup({ strict: true });
    await ready(t, 'a');
    await t.click('edit-active');
    await act(async () => {
      void t.router.navigate({ to: '/elsewhere' as never });
      await Promise.resolve();
    });
    await screen.findByRole('alertdialog');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  });

  it('does not ask when nothing is unsaved', async () => {
    const t = setup();
    await ready(t, 'a');
    await act(async () => {
      await t.router.navigate({ to: '/elsewhere' as never });
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(t.router.state.location.pathname).toBe('/elsewhere');
  });
});
