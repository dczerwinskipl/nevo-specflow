import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import type { SessionListItem, SessionListPage } from '@nevo/specflow-contracts/sessions';
import { withLocale } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { ViewPageTitle } from '../../../app/navigation/ApplicationLocation';
import type { SessionAssociationsApi } from '../associations/api';
import type { SessionCollection } from './loadSessions';
import { SpecificationSessionsList } from './SpecificationSessionsList';
import { useSpecificationSessionList } from './useSpecificationSessionList';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function row(
  sessionId: string,
  overrides: Partial<SessionListItem> & { taskCount?: number } = {},
): SessionListItem {
  const { taskCount = 0, ...rest } = overrides;

  return {
    sessionId,
    title: `Sesja ${sessionId}`,
    providerId: 'claude',
    readiness: 'ready',
    createdAt: minutesAgo(90),
    updatedAt: minutesAgo(12),
    association: {
      kind: 'specification',
      specId: 'auth',
      taskIds: Array.from({ length: taskCount }, (_, index) => `task-${index}`),
    },
    ...rest,
  };
}

const currentRows: SessionListItem[] = [
  row('a', { title: 'Przegląd logowania SSO', readiness: 'requiresAttention', taskCount: 1 }),
  row('b', { title: 'Migracja sesji', readiness: 'busy', taskCount: 3 }),
  row('c', { title: undefined, readiness: 'unavailable', taskCount: 5 }),
  row('d', { title: 'Raport z testów', updatedAt: minutesAgo(60 * 30) }),
];

/** The pages the faked Session list read answers, in order, per collection. */
type Pages = Record<SessionCollection, SessionListPage[]>;

/** The requests the list sent (reset by every mount). */
const requests: { archived: string; cursor?: string }[] = [];

function pagedApi(pages: Pages, failAt?: number): Pick<SessionAssociationsApi, 'list'> {
  return {
    list: ({ archived, cursor }) => {
      requests.push({ archived, ...(cursor ? { cursor } : {}) });
      const collection: SessionCollection = archived === 'only' ? 'archive' : 'current';
      const index = cursor ? Number(cursor.slice(1)) : 0;
      if (failAt !== undefined && requests.length === failAt) {
        return Promise.reject(new Error('Session list unavailable'));
      }

      const page = pages[collection][index];

      return page ? Promise.resolve(page) : new Promise(() => undefined);
    },
  };
}

/** The real list hook over a faked Session list read; the collection control works. */
function ListPreview({
  pages,
  failAt,
  offersNewSession = true,
  sessionsDisabled = false,
  refusal,
  pageTitle,
}: {
  pages: Pages;
  /** The n-th request (1-based) fails. */
  failAt?: number;
  offersNewSession?: boolean;
  /** The workspace says Sessions are turned off: the list read is never sent. */
  sessionsDisabled?: boolean;
  /** Every list read is refused: 403, or Sessions turned off (`SESSION_DISABLED`). */
  refusal?: 'forbidden' | 'disabled';
  /** The page title the route renders above the list (`ViewPageTitle`). */
  pageTitle?: string;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const services = useMemo(() => {
    requests.length = 0;
    const list = pagedApi(pages, failAt).list;

    return createSpecFlowAppServices({
      sessionAssociationsApi: {
        association: () => Promise.reject(new Error('unused')),
        createInSpecification: () => Promise.reject(new Error('unused')),
        list: refusal
          ? () => {
              requests.push({ archived: 'refused' });

              return Promise.reject(
                refusal === 'forbidden'
                  ? new HttpClientError('forbidden', { kind: 'http', status: 403, data: {} })
                  : new HttpClientError('disabled', {
                      kind: 'http',
                      status: 503,
                      data: { code: 'SESSION_DISABLED' },
                    }),
              );
            }
          : list,
      },
    });
  }, [pages, failAt, refusal]);

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <div className="p-6">
          {pageTitle ? <ViewPageTitle>{pageTitle}</ViewPageTitle> : null}
          <Harness offersNewSession={offersNewSession} sessionsDisabled={sessionsDisabled} />
        </div>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const onNewSession = fn();
const onOpenSession = fn();

function Harness({
  offersNewSession,
  sessionsDisabled,
}: {
  offersNewSession: boolean;
  sessionsDisabled: boolean;
}) {
  const [collection, setCollection] = useState<SessionCollection>('current');
  const state = useSpecificationSessionList('auth', collection, sessionsDisabled);

  return (
    <SpecificationSessionsList
      state={state}
      collection={collection}
      onCollectionChange={setCollection}
      onNewSession={offersNewSession ? onNewSession : undefined}
      onOpenSession={onOpenSession}
    />
  );
}

/**
 * The Specification Sessions list (`/specs/:specId/sessions`,
 * `docs/ideas/specflow-ui/session-association-ux/README.md` §3): current/archive collections of the
 * Session list read, rows with Session-owned status only, and the explicit **Pokaż więcej** paging
 * that follows sparse pages at most four requests per press. The real list hook runs over a faked
 * read.
 */
const meta = {
  title: 'SpecFlow/Screens/Specification Sessions',
  component: ListPreview,
  decorators: [withLocale('pl')],
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ListPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Rows: title (or the untitled label), Session status, associated Task count, relative update. */
export const CurrentSessions: Story = {
  args: { pages: { current: [{ items: currentRows }], archive: [{ items: [] }] } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: 'Przegląd logowania SSO' }),
    ).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Bieżące' })).toBeChecked();
    await expect(canvas.getByText('Wymaga uwagi')).toBeVisible();
    await expect(canvas.getByText('Aktywna')).toBeVisible();
    await expect(canvas.getByText('Stan sesji nieznany')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Sesja bez nazwy' })).toBeVisible();
    await expect(canvas.getByText('Powiązana z 3 zadaniami')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Pokaż więcej' })).toBeNull();
    // No developer text and no provider or ids on a row.
    await expect(canvas.queryByText(/claude/)).toBeNull();
    onOpenSession.mockClear();
    await userEvent.click(canvas.getByRole('button', { name: 'Migracja sesji' }));
    await expect(onOpenSession).toHaveBeenCalledWith('b');
  },
};

/** Archived Sessions sit under **Archiwum**, without an archived label; empty says so, no action. */
export const ArchiveCollection: Story = {
  args: {
    pages: {
      current: [{ items: currentRows }],
      archive: [{ items: [row('z', { title: 'Stara sesja' })] }],
    },
  },
  play: async ({ canvas }) => {
    await canvas.findByRole('button', { name: 'Przegląd logowania SSO' });
    await userEvent.click(canvas.getByRole('radio', { name: 'Archiwum' }));
    await expect(await canvas.findByRole('button', { name: 'Stara sesja' })).toBeVisible();
    await expect(canvas.queryByText('W archiwum')).toBeNull();
    await waitFor(() => expect(requests.at(-1)).toEqual({ archived: 'only' }));
  },
};

export const EmptyCurrent: Story = {
  args: { pages: { current: [{ items: [] }], archive: [{ items: [] }] } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Ta specyfikacja nie ma jeszcze sesji.')).toBeVisible();
    // The header action and the empty state's own action.
    await expect(canvas.getAllByRole('button', { name: 'Nowa sesja' })).toHaveLength(2);
  },
};

export const EmptyArchive: Story = {
  args: { pages: { current: [{ items: [] }], archive: [{ items: [] }] } },
  play: async ({ canvas }) => {
    await canvas.findByText('Ta specyfikacja nie ma jeszcze sesji.');
    await userEvent.click(canvas.getByRole('radio', { name: 'Archiwum' }));
    await expect(await canvas.findByText('Brak zarchiwizowanych sesji')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'Nowa sesja' })).toHaveLength(1);
  },
};

/** A viewer: no **Nowa sesja** anywhere. */
export const WithoutNewSession: Story = {
  args: { pages: { current: [{ items: [] }], archive: [] }, offersNewSession: false },
  play: async ({ canvas }) => {
    await canvas.findByText('Ta specyfikacja nie ma jeszcze sesji.');
    await expect(canvas.queryByRole('button', { name: 'Nowa sesja' })).toBeNull();
  },
};

/**
 * Sparse rows: one press follows the cursor past empty pages until a row arrives, appends it below
 * and says how many arrived; focus stays on the button.
 */
export const ShowMoreFollowsSparsePages: Story = {
  args: {
    pages: {
      current: [
        { items: currentRows.slice(0, 2), nextCursor: 'p1' },
        { items: [], nextCursor: 'p2' },
        { items: [], nextCursor: 'p3' },
        { items: [row('e', { title: 'Późna sesja' })], nextCursor: 'p4' },
        { items: [row('h', { title: 'Ostatnia sesja' })] },
      ],
      archive: [],
    },
  },
  play: async ({ canvas }) => {
    const more = await canvas.findByRole('button', { name: 'Pokaż więcej' });
    await userEvent.click(more);
    await expect(await canvas.findByRole('button', { name: 'Późna sesja' })).toBeVisible();
    await expect(requests).toHaveLength(4);
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Wczytano 1 sesję'));
    await expect(canvas.getByRole('button', { name: 'Pokaż więcej' })).toHaveFocus();
    // The last page ends the cursor: the button goes and focus moves to the first row that came.
    await userEvent.click(canvas.getByRole('button', { name: 'Pokaż więcej' }));
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Pokaż więcej' })).toBeNull());
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Ostatnia sesja' })).toHaveFocus(),
    );
    await expect(canvas.queryByText('Ta specyfikacja nie ma jeszcze sesji.')).toBeNull();
  },
};

/** Four requests without a row while a cursor remains: the button stays with one muted line. */
export const ShowMoreNoneInBatch: Story = {
  args: {
    pages: {
      current: [
        { items: [currentRows[0]!], nextCursor: 'p1' },
        { items: [], nextCursor: 'p2' },
        { items: [], nextCursor: 'p3' },
        { items: [], nextCursor: 'p4' },
        { items: [], nextCursor: 'p5' },
        { items: [row('f')] },
      ],
      archive: [],
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Pokaż więcej' }));
    await expect(
      await canvas.findByText('Nie znaleziono więcej sesji w tej partii. Możesz szukać dalej.', {
        selector: ':not([role="status"])',
      }),
    ).toBeVisible();
    // The first load plus at most four requests for the press.
    await expect(requests).toHaveLength(5);
    await expect(canvas.getByRole('button', { name: 'Pokaż więcej' })).toBeVisible();
    // Said politely too, and again for the next empty batch.
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent(
        'Nie znaleziono więcej sesji w tej partii. Możesz szukać dalej.',
      ),
    );
  },
};

/**
 * A press that ends the cursor without a new row: the focused button goes away, so focus moves to
 * the list's page heading instead of falling back to the document.
 */
export const ShowMoreEndsWithoutRows: Story = {
  args: {
    pageTitle: 'Sesje',
    pages: {
      current: [
        { items: currentRows.slice(0, 2), nextCursor: 'p1' },
        { items: [], nextCursor: 'p2' },
        { items: [] },
      ],
      archive: [],
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Pokaż więcej' }));
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Pokaż więcej' })).toBeNull());
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Sesje' })).toHaveFocus());
    await expect(requests).toHaveLength(3);
    // The loaded rows stay; no empty state, no batch line.
    await expect(canvas.getByRole('button', { name: 'Migracja sesji' })).toBeVisible();
    await expect(canvas.queryByText('Ta specyfikacja nie ma jeszcze sesji.')).toBeNull();
    await expect(
      canvas.queryByText('Nie znaleziono więcej sesji w tej partii. Możesz szukać dalej.'),
    ).toBeNull();
  },
};

/** No row yet but a cursor remains: never the empty state, the button instead. */
export const FirstLoadWithoutRows: Story = {
  args: {
    pages: {
      current: [
        { items: [], nextCursor: 'p1' },
        { items: [], nextCursor: 'p2' },
        { items: [], nextCursor: 'p3' },
        { items: [], nextCursor: 'p4' },
      ],
      archive: [],
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Pokaż więcej' })).toBeVisible();
    await expect(canvas.queryByText('Ta specyfikacja nie ma jeszcze sesji.')).toBeNull();
    await expect(
      canvas.getByText('Nie znaleziono więcej sesji w tej partii. Możesz szukać dalej.'),
    ).toBeVisible();
  },
};

/** A failed press keeps the loaded rows; the button retries the same cursor. */
export const ShowMoreFailed: Story = {
  args: {
    pages: {
      current: [{ items: currentRows.slice(0, 1), nextCursor: 'p1' }, { items: [row('g')] }],
      archive: [],
    },
    failAt: 2,
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Pokaż więcej' }));
    await expect(
      await canvas.findByText('Nie udało się wczytać kolejnych sesji.', {
        selector: ':not([role="status"])',
      }),
    ).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent(
        'Nie udało się wczytać kolejnych sesji.',
      ),
    );
    await expect(canvas.getByRole('button', { name: 'Przegląd logowania SSO' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Pokaż więcej' }));
    await expect(await canvas.findByRole('button', { name: 'Sesja g' })).toBeVisible();
    await expect(requests.at(-1)).toEqual({ archived: 'exclude', cursor: 'p1' });
  },
};

export const Loading: Story = {
  args: { pages: { current: [], archive: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: 'Bieżące' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Nowa sesja' })).toBeVisible();
  },
};

export const Failed: Story = {
  args: { pages: { current: [], archive: [] }, failAt: 1 },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Nie udało się wczytać sesji.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
  },
};

export const Forbidden: Story = {
  args: { pages: { current: [], archive: [] }, refusal: 'forbidden', offersNewSession: false },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('Nie masz dostępu do sesji tej specyfikacji.'),
    ).toBeVisible();
  },
};

/** Sessions turned off in the project: said once, not as a failed read. */
export const SessionsDisabled: Story = {
  args: {
    pages: { current: [{ items: [] }], archive: [] },
    sessionsDisabled: true,
    offersNewSession: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sesje są wyłączone w tym projekcie.')).toBeVisible();
    await expect(canvas.queryByText('Nie udało się wczytać sesji.')).toBeNull();
    await expect(canvas.queryByRole('radio', { name: 'Bieżące' })).toBeNull();
    // Known from the workspace: the list read is never sent.
    await expect(requests).toHaveLength(0);
  },
};

/** The list read itself answers `SESSION_DISABLED`: the same turned-off state, never a failure. */
export const SessionsDisabledByListRead: Story = {
  args: { pages: { current: [], archive: [] }, refusal: 'disabled', offersNewSession: false },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Sesje są wyłączone w tym projekcie.')).toBeVisible();
    await expect(canvas.queryByText('Nie udało się wczytać sesji.')).toBeNull();
    await expect(canvas.queryByRole('radio', { name: 'Archiwum' })).toBeNull();
  },
};

export const Mobile: Story = {
  ...CurrentSessions,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: 'Przegląd logowania SSO' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth),
    );
  },
};
