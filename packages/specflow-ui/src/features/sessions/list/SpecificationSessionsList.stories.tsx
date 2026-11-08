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

const claude = { providerId: 'claude', providerTitle: 'Claude' } as const;
const codex = { providerId: 'codex', providerTitle: 'Codex' } as const;
const antigravity = { providerId: 'antigravity', providerTitle: 'Antigravity' } as const;

/** The accepted reference rows (Sessions list §3): one per status, provider and fact shape. */
const currentRows: SessionListItem[] = [
  row('a', {
    ...claude,
    title: 'Przegląd logowania SSO i odświeżania tokenów',
    modelId: 'claude-opus-4-1',
    modelTitle: 'Opus 4.1',
    readiness: 'requiresAttention',
    taskCount: 3,
    updatedAt: minutesAgo(5),
  }),
  row('b', {
    ...codex,
    title: 'Migracja tabeli sesji do nowego schematu z zachowaniem historii zmian',
    modelId: 'gpt-5.2-codex',
    modelTitle: 'GPT-5.2-Codex',
    readiness: 'busy',
    updatedAt: minutesAgo(12),
  }),
  row('c', {
    ...claude,
    title: undefined,
    modelId: 'claude-sonnet-4-5',
    modelTitle: 'Sonnet 4.5',
    readiness: 'authenticationRequired',
    updatedAt: minutesAgo(120),
  }),
  row('d', {
    ...antigravity,
    title: 'Raport z testów e2e',
    modelId: 'gemini-3-pro',
    modelTitle: 'Gemini 3 Pro',
    updatedAt: minutesAgo(60 * 30),
  }),
];

/** Each row's leading mark is centred on the row content (title, facts and any status line). */
async function expectMarksCentred(canvasElement: HTMLElement) {
  const rows = canvasElement.querySelectorAll<HTMLElement>('[data-session-row]');
  await expect(rows.length).toBeGreaterThan(0);
  for (const rowElement of rows) {
    // The row's first slot is the leading box; the mark is its only child.
    const mark = rowElement.firstElementChild!.firstElementChild!.firstElementChild!;
    await expect(mark.getAttribute('aria-hidden')).toBe('true');
    const content = rowElement.querySelector('[data-spec-title]')!.parentElement!;
    const markBox = mark.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const centre = (box: DOMRect) => box.top + box.height / 2;
    await expect(
      Math.abs(centre(markBox) - centre(contentBox)),
      `mark centre of ${rowElement.dataset.sessionRow}`,
    ).toBeLessThanOrEqual(1);
  }
}

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

/** The row elements a play measures. */
function rowParts(canvasElement: HTMLElement, sessionId: string) {
  const rowElement = canvasElement.querySelector<HTMLElement>(`[data-session-row="${sessionId}"]`)!;
  const facts = [...rowElement.querySelectorAll<HTMLElement>('[data-inline-fact]')];

  return {
    row: rowElement,
    title: rowElement.querySelector('[data-spec-title] button')!.getBoundingClientRect(),
    facts,
    status: rowElement.querySelector<HTMLElement>('[data-inline-status]'),
  };
}

/**
 * The mark is no dead click zone: the browser's hit test at its centre lands on the row's primary
 * button (its stretched area), so a click there opens the Session like the rest of the row.
 */
/**
 * No facts line, wrapped or not, starts with `·`: a separator is either clipped entirely left of
 * the facts box (it opens a line) or follows visible text on its own line.
 */
async function expectNoLineStartsWithSeparator(canvasElement: HTMLElement) {
  for (const secondary of canvasElement.querySelectorAll<HTMLElement>('[data-spec-secondary]')) {
    const clip = secondary.getBoundingClientRect();
    const texts = [
      ...secondary.querySelectorAll<HTMLElement>('[data-inline-fact], [data-inline-status]'),
    ].map((item) => item.lastElementChild!.getBoundingClientRect());
    for (const separator of secondary.querySelectorAll<HTMLElement>('[data-inline-separator]')) {
      const box = separator.getBoundingClientRect();
      if (box.right <= clip.left + 0.5) {
        continue;
      }

      await expect(box.left, 'a visible separator is never cut by the clip').toBeGreaterThan(
        clip.left + 1,
      );
      const before = texts.some(
        (text) => Math.abs(text.top - box.top) < 4 && text.right <= box.left + 0.5,
      );
      await expect(before, `separator at ${box.left},${box.top} opens a line`).toBe(true);
    }
  }
}

async function expectMarkOpensSession(canvasElement: HTMLElement, sessionId: string) {
  const parts = rowParts(canvasElement, sessionId);
  const mark = parts.row.firstElementChild!.firstElementChild!.getBoundingClientRect();
  const hit = document.elementFromPoint(mark.left + mark.width / 2, mark.top + mark.height / 2);
  await expect(hit).toBe(parts.row.querySelector('[data-spec-title] button'));
}

/** The visible fact text, without its separator or assistive text (`5 minut temu`, `Opus 4.1`). */
const factText = (fact: HTMLElement) =>
  (fact.lastElementChild!.querySelector('[aria-hidden="true"]') ?? fact.lastElementChild!)
    .textContent;

/**
 * Rows (Sessions list §3, acceptance 4, 7, 8): the provider mark, the title (or the untitled
 * label), then age · agent · Tasks and the effective status as the last inline item at Wide. The
 * agent's provider reaches assistive technology with the model; a provider sign-in names the
 * provider and is muted.
 */
export const CurrentSessions: Story = {
  args: { pages: { current: [{ items: currentRows }], archive: [{ items: [] }] } },
  play: async ({ canvasElement, canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: 'Przegląd logowania SSO i odświeżania tokenów' }),
    ).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Bieżące' })).toBeChecked();
    const first = rowParts(canvasElement, 'a');
    await expect(first.facts.map(factText)).toEqual(['5 minut temu', 'Opus 4.1', '3 zadania']);
    await expect(first.row).toHaveTextContent('Claude, model Opus 4.1');
    await expect(canvas.getByText('Powiązana z 3 zadaniami')).toBeInTheDocument();
    await expect(canvas.getByText('Wymaga uwagi')).toBeVisible();
    await expect(canvas.getByText('Aktywna')).toBeVisible();
    const signIn = canvas.getByText('Claude: wymagane ponowne logowanie');
    await expect(signIn).toBeVisible();
    await expect(signIn.closest('.text-content-muted')).not.toBeNull();
    await expect(canvas.queryByText('Stan sesji nieznany')).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Sesja bez nazwy' })).toBeVisible();
    // The quiet Antigravity row: no status at all.
    await expect(rowParts(canvasElement, 'd').status).toBeNull();
    // Wide: the status shares the facts' line box (no 1 px offset above the facts).
    const age = first.facts[0]!.getBoundingClientRect();
    const status = first.status!.getBoundingClientRect();
    await expect(Math.abs(status.top - age.top)).toBeLessThanOrEqual(0.5);
    await expect(status.left).toBeGreaterThan(first.facts.at(-1)!.getBoundingClientRect().right);
    await expectMarksCentred(canvasElement);
    await expectNoLineStartsWithSeparator(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Pokaż więcej' })).toBeNull();
    await expectMarkOpensSession(canvasElement, 'a');
    onOpenSession.mockClear();
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Migracja tabeli sesji do nowego schematu z zachowaniem historii zmian',
      }),
    );
    await expect(onOpenSession).toHaveBeenCalledWith('b');
  },
};

/**
 * Mixed list (acceptance 5): with and without Tasks, every age starts under the title start and
 * an absent fact takes no space; an age or a count never wraps inside itself.
 */
export const AgeLeadsEveryRow: Story = {
  args: {
    pages: {
      current: [
        {
          items: [
            row('p', { ...claude, modelTitle: 'Opus 4.1', taskCount: 3, updatedAt: minutesAgo(1) }),
            row('q', { ...codex, modelId: 'gpt-5.1', updatedAt: minutesAgo(60 * 12) }),
            row('r', { ...antigravity, readiness: 'busy', updatedAt: minutesAgo(60 * 12) }),
          ],
        },
      ],
      archive: [],
    },
  },
  play: async ({ canvasElement, canvas }) => {
    await canvas.findByRole('button', { name: 'Sesja p' });
    for (const sessionId of ['p', 'q', 'r']) {
      const parts = rowParts(canvasElement, sessionId);
      const age = parts.facts[0]!.lastElementChild!;
      const box = age.getBoundingClientRect();
      await expect(Math.abs(box.left - parts.title.left)).toBeLessThan(1);
      await expect(box.height).toBeLessThan(parseFloat(getComputedStyle(age).lineHeight) * 1.5);
    }

    await expect(rowParts(canvasElement, 'p').facts).toHaveLength(3);
    await expect(rowParts(canvasElement, 'q').facts.map(factText)).toEqual([
      '12 godzin temu',
      'gpt-5.1',
    ]);
    // A provider only: the provider names the agent, visibly and for assistive technology.
    await expect(rowParts(canvasElement, 'r').facts.map(factText)).toEqual([
      '12 godzin temu',
      'Antigravity',
    ]);
  },
};

/**
 * A provider or model no longer listed (acceptance 7): the `chat` glyph, the raw model id, else
 * the provider id, as the agent fact. A long model title truncates at 16 rem.
 */
export const UnlistedProvider: Story = {
  args: {
    pages: {
      current: [
        {
          items: [
            row('u', { providerId: 'retired-cli', modelId: 'model-x', updatedAt: minutesAgo(3) }),
            row('v', { providerId: 'retired-cli', updatedAt: minutesAgo(4) }),
            row('w', {
              ...claude,
              modelTitle:
                'A very long model title that the provider names without any abbreviation',
              updatedAt: minutesAgo(5),
            }),
          ],
        },
      ],
      archive: [],
    },
  },
  play: async ({ canvasElement, canvas }) => {
    await canvas.findByRole('button', { name: 'Sesja u' });
    const unlisted = rowParts(canvasElement, 'u');
    await expect(unlisted.facts.map(factText)).toEqual(['3 minuty temu', 'model-x']);
    await expect(unlisted.row).toHaveTextContent('retired-cli, model model-x');
    await expect(unlisted.row.querySelector('svg')).not.toBeNull();
    await expect(rowParts(canvasElement, 'v').facts.map(factText)).toEqual([
      '4 minuty temu',
      'retired-cli',
    ]);
    const long = rowParts(canvasElement, 'w').facts[1]!.lastElementChild as HTMLElement;
    const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(long.getBoundingClientRect().width).toBeLessThanOrEqual(16 * rootSize + 0.5);
    await expect(long.scrollWidth).toBeGreaterThan(long.clientWidth);
    await expect(rowParts(canvasElement, 'w').row).toHaveTextContent(
      'Claude, model A very long model title that the provider names without any abbreviation',
    );
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
    await canvas.findByRole('button', { name: 'Przegląd logowania SSO i odświeżania tokenów' });
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
    await expect(
      canvas.getByRole('button', {
        name: 'Migracja tabeli sesji do nowego schematu z zachowaniem historii zmian',
      }),
    ).toBeVisible();
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
    await expect(
      canvas.getByRole('button', { name: 'Przegląd logowania SSO i odświeżania tokenów' }),
    ).toBeVisible();
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

/**
 * Narrow (acceptance 9): the title and facts wrap, the status takes its own line under the facts,
 * the mark stays centred on the whole row, no horizontal overflow; a click on the mark opens the
 * Session.
 */
export const Mobile: Story = {
  ...CurrentSessions,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement, canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: 'Przegląd logowania SSO i odświeżania tokenów' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth),
    );
    for (const sessionId of ['a', 'b', 'c']) {
      const parts = rowParts(canvasElement, sessionId);
      const lastFact = parts.facts.at(-1)!.getBoundingClientRect();
      const status = parts.status!.lastElementChild!.getBoundingClientRect();
      await expect(status.top).toBeGreaterThanOrEqual(lastFact.bottom - 0.5);
      await expect(Math.abs(status.left - parts.title.left)).toBeLessThan(1);
    }

    await expectNoLineStartsWithSeparator(canvasElement);
    await expectMarksCentred(canvasElement);
    await expectMarkOpensSession(canvasElement, 'b');
  },
};

/**
 * 390 px with facts that wrap (a long model title and Tasks): the line breaks between items and
 * neither the wrapped line nor the status line starts with `·`.
 */
export const WrappedFactsAt390: Story = {
  args: {
    pages: {
      current: [
        {
          items: [
            row('x', {
              ...claude,
              modelTitle: 'Opus 4.1 with an extended context window preview',
              readiness: 'requiresAttention',
              taskCount: 12,
              updatedAt: minutesAgo(60 * 24 * 21),
            }),
          ],
        },
      ],
      archive: [],
    },
  },
  parameters: {
    viewport: {
      options: {
        phone390: { name: '390 px', styles: { width: '390px', height: '844px' }, type: 'mobile' },
      },
    },
  },
  globals: { viewport: { value: 'phone390', isRotated: false } },
  play: async ({ canvasElement, canvas }) => {
    await canvas.findByRole('button', { name: 'Sesja x' });
    await waitFor(() => expect(window.innerWidth).toBe(390));
    const parts = rowParts(canvasElement, 'x');
    const tops = new Set(parts.facts.map((fact) => Math.round(fact.getBoundingClientRect().top)));
    await expect(tops.size, 'the facts wrap at 390').toBeGreaterThan(1);
    await expectNoLineStartsWithSeparator(canvasElement);
    await expectMarksCentred(canvasElement);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
