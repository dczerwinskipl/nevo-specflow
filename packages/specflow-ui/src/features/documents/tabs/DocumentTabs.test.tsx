// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/react-router';
import type { DemoDocumentTree } from '@nevo/specflow-contracts/demo';
import type { SpecificationDocumentResponse } from '@nevo/specflow-contracts/specs/workspace';
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

const SPEC = 'spec';
const names = { a: 'a.md', b: 'b.md', c: 'c.md' } as const;
type Id = keyof typeof names;

const record = (id: Id): SpecificationDocumentResponse => ({
  id,
  title: id,
  filename: names[id],
  content: `${id.toUpperCase()}0`,
  revision: `${id}1`,
});

function tree(ids: readonly Id[]): DemoDocumentTree {
  const actions = {
    rename: { available: true },
    move: { available: true },
    delete: { available: true },
  };
  return {
    revision: 't',
    folders: [],
    documents: ids.map((id) => ({ id, path: `docs/${names[id]}`, revision: `${id}1`, actions })),
    capabilities: {
      createFile: { available: true },
      createFolder: { available: true },
      import: { available: true },
      formats: [],
    },
  };
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
      : Promise.resolve({ revision: `${id}2` }),
  );
  const services = createSpecFlowAppServices({
    documentApi: { getDocument } as unknown as DocumentApi,
    documentsApi: {
      documentTree: () => Promise.resolve(tree(['a', 'b', 'c'])),
      save,
    } as unknown as DocumentsApi,
  });
  const leave = createRef<(() => Promise<boolean>) | null>() as {
    current: (() => Promise<boolean>) | null;
  };
  const seen: { tabs?: ReturnType<typeof useDocumentTabs> } = {};

  function Probe() {
    const tabs = useDocumentTabs();
    const session = useDocumentEditor();
    seen.tabs = tabs;
    return (
      <div>
        <output data-testid="active">{tabs.activeId ?? 'none'}</output>
        <output data-testid="tabs">
          {tabs.tabs.map((tab) => `${tab.id}:${tab.state}${tab.dirty ? '*' : ''}`).join(',')}
        </output>
        <output data-testid="failed">{String(tabs.closeFailed)}</output>
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
        <DocumentRouteGuard specId={SPEC} requestRef={leave} />
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
  if (state) history.replace(initial, state);
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
  return { router, history, store, save, getDocument, leave, seen, click, text };
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
    expect(t.save).toHaveBeenCalledWith(SPEC, 'a', { content: 'EDIT', expectedRevision: 'a1' });
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
