// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { appI18n } from '../../../i18n';
import { DocsSearchPanel } from '../tree-pane/DocsSearchPanel';
import { historyEntryOf, readerAddress } from './readerLocation';
import { readerSearchOf, validateDocsReaderSearch } from './readerSearch';
import { useWriteReaderSearch } from './useWriteReaderSearch';

/** Every search answers at once with one result named after its text (one answer per text). */
const answers = new Map<string, WorkspaceDocsSearch>();

vi.mock('../read-model', () => ({
  useDocsSearch: (workspaceId: string | undefined, query: { q: string }) => {
    const key = `${workspaceId ?? ''}:${query.q}`;
    const data: WorkspaceDocsSearch | undefined =
      answers.get(key) ??
      (workspaceId && query.q
        ? {
            mode: 'hybrid',
            workspaceId,
            corpusRevision: 'rev',
            results: [
              {
                id: `doc-${query.q}`,
                title: `Result for ${query.q}`,
                type: 'reference',
                status: 'current',
                file: 'a.md',
                score: 1,
                wordMatch: true,
                sections: [],
              },
            ],
            proposalsLeftOut: 0,
            skipped: [],
          }
        : undefined);
    if (data) {
      answers.set(key, data);
    }

    return {
      isSuccess: data !== undefined,
      isError: false,
      isFetching: false,
      data,
      refetch: () => Promise.resolve(),
    };
  },
}));

afterEach(cleanup);

beforeAll(async () => {
  await appI18n.changeLanguage('en');
});

/**
 * The reader's address wiring around the real search panel: the address it reads, the write of
 * the search, the entry identity and an opened result that carries the search on, as the reader
 * does.
 */
function Reader() {
  const location = useLocation();
  const router = useRouter();
  const navigate = useNavigate();
  const writeSearch = useWriteReaderSearch();
  const workspaceId = readerAddress(location.pathname)?.workspaceId;

  return (
    <DocsSearchPanel
      workspaceId={workspaceId}
      historyEntry={historyEntryOf(location.state)}
      search={readerSearchOf(location)}
      onSearchChange={writeSearch}
      proposals={new Set()}
      onOpen={(documentId) =>
        void navigate({
          to: '/workspaces/$workspaceId/docs/$documentId',
          params: { workspaceId: workspaceId!, documentId },
          search: readerSearchOf(router.state.location),
        })
      }
    >
      <p>tree</p>
    </DocsSearchPanel>
  );
}

function mount(initial: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const layout = createRoute({
    getParentRoute: () => rootRoute,
    id: 'docs-reader',
    validateSearch: validateDocsReaderSearch,
    component: Reader,
  });
  const routes = ['/workspaces/$workspaceId/docs', '/workspaces/$workspaceId/docs/$documentId'].map(
    (path) => createRoute({ getParentRoute: () => layout, path }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren([layout.addChildren(routes)]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(<RouterProvider router={router} />);

  return router;
}

const field = () => screen.getByRole<HTMLInputElement>('searchbox');
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

describe('the search in the reader address', () => {
  it('writes typing as one replace, carries the search on a push and restores it on Back', async () => {
    const router = mount('/workspaces/w/docs');
    await act(() => router.load());
    const entries = router.history.length;
    const entry = historyEntryOf(router.state.location.state);

    type('ses');
    type('session');
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'session' }));
    // Typing replaced the entry: no history entry was added, and it is the same visit.
    expect(router.history.length).toBe(entries);
    expect(historyEntryOf(router.state.location.state)).toBe(entry);
    expect(router.state.location.searchStr).toBe('?q=session');

    // Opening a result is a push that keeps the search.
    fireEvent.click(await screen.findByText('Result for session'));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/workspaces/w/docs/doc-session'),
    );
    expect(router.history.length).toBe(entries + 1);
    expect(router.state.location.search).toEqual({ q: 'session' });

    // Another search on the document's entry, then Back: the list of the entry left returns.
    type('provider');
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'provider' }));
    expect(router.history.length).toBe(entries + 1);
    act(() => router.history.back());
    await waitFor(() => expect(field().value).toBe('session'));
    expect(screen.getByText('Result for session')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/workspaces/w/docs');

    act(() => router.history.forward());
    await waitFor(() => expect(field().value).toBe('provider'));
  });

  it('reads a linked search and removes it when the field is cleared', async () => {
    const router = mount('/workspaces/w/docs?q=%20session%20&proposals=1&other=x');
    await act(() => router.load());

    expect(field().value).toBe('session');
    expect(await screen.findByText('Result for session')).toBeTruthy();
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ proposals: 1 }));
    expect(screen.getByText('tree')).toBeTruthy();
  });
});
