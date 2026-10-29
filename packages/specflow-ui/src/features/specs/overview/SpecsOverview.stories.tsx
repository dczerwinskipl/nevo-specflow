import { useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { AppShell, Typography } from '@nevo/ui';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';

import { SpecFlowShell } from '../../../app/SpecFlowShell';
import { UiPlaygroundScreen } from '../../../app/screens';
import { LoginScreen } from '../../../auth/LoginScreen';
import { createAuthStore } from '../../../auth/store';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { AppLocale } from '../../../i18n';
import {
  createLongContentFixture,
  createSpecItem,
  createSpecsFixture,
  createArchiveItem,
} from '../../../../test-support/specs/overview/fixtures';
import type {
  SpecsCollection,
  SpecsOverview as SpecsOverviewData,
  SpecsOverviewState,
  CurrentSpecTarget,
} from './model';
import { SpecsOverview } from './SpecsOverview';
import { OperationsPanelHost } from '../../../shared/operations';
import type { OperationListItem } from '../../../shared/operations/operationList';
import {
  operationList,
  operationsStub,
  runningItem,
  operationItem,
  stubCreateKind,
} from '../../../../test-support/operations/fixtures';
import { useSpecsOverview } from './data/useSpecsOverview';
import type { SpecsOverviewApi } from './data/api';

import { QueryClientProvider } from '@tanstack/react-query';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { specPrimaryLinkClassName } from './rows/SpecPrimaryLink';

function SourceLifecycleFixture() {
  const queryClient = useMemo(() => createSpecFlowQueryClient(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <SourceLifecycleComponent />
    </QueryClientProvider>
  );
}

function SourceLifecycleComponent() {
  const [collection, setCollection] = useState<SpecsCollection>('current');
  const pending = useRef<
    {
      collection: SpecsCollection;
      resolve: (value: SpecsOverviewData) => void;
      reject: (error: Error) => void;
    }[]
  >([]);
  const source = useMemo<SpecsOverviewApi>(
    () => ({
      getOverview: (scope) =>
        new Promise((resolve, reject) => {
          // Deliberately ignores cancellation: the owner must also guard late responses.
          pending.current.push({ collection: scope, resolve, reject });
        }),
    }),
    [],
  );
  const { state, refresh } = useSpecsOverview(source, collection);
  const settle = (scope: SpecsCollection, failure = false, invalid = false) => {
    const request = pending.current.findLast((item) => item.collection === scope);
    if (!request) throw new Error('Expected a pending collection request.');
    if (failure) request.reject(new Error('Fixture unavailable'));
    else {
      const projection = createSpecsFixture();
      request.resolve(
        invalid
          ? {
              ...projection,
              items: projection.items.map((item, index) =>
                index === 0 ? { ...item, progress: { completed: 10, total: 9 } } : item,
              ),
            }
          : createSpecsFixture(scope),
      );
    }
  };
  return (
    <StoryLocalization locale="en">
      <div className="h-dvh">
        <AppShell navigation={<Typography className="p-4">Specs</Typography>}>
          <SpecsOverview state={state} onCollectionChange={setCollection} onRefresh={refresh} />
        </AppShell>
      </div>
      <div className="flex gap-4 p-4" aria-label="Source test controls">
        <button type="button" onClick={() => settle('current')}>
          Resolve Current
        </button>
        <button type="button" onClick={() => settle('current', false, true)}>
          Resolve invalid Current
        </button>
        <button type="button" onClick={() => settle('archive')}>
          Resolve Archive
        </button>
        <button type="button" onClick={() => settle('archive', true)}>
          Fail Archive
        </button>
      </div>
    </StoryLocalization>
  );
}

function OverviewFixture({
  state,
  locale = 'en',
  interactive = true,
  operations,
}: {
  state: SpecsOverviewState;
  locale?: AppLocale;
  interactive?: boolean;
  operations?: readonly OperationListItem[];
}) {
  const queryClient = useMemo(() => createSpecFlowQueryClient(), []);
  const router = useMemo(() => {
    const signedIn: AuthSessionResponse = {
      authenticationRequired: true,
      authenticated: true,
      user: { id: 'demo', name: 'Demo' },
      authenticatedWith: { kind: 'password' },
      loginMethods: { password: { enabled: true }, oidc: [] },
    };
    const signedOut: AuthSessionResponse = {
      authenticationRequired: true,
      authenticated: false,
      loginMethods: signedIn.loginMethods,
    };
    let session: AuthSessionResponse = signedIn;
    const auth = createAuthStore(
      {
        getSession: () => Promise.resolve(session),
        loginWithPassword: () => {
          session = signedIn;
          return Promise.resolve(session);
        },
        startOidc: () => Promise.reject(new Error('OIDC is not enabled in this fixture.')),
        logout: () => {
          session = signedOut;
          return Promise.resolve();
        },
      },
      session,
    );
    // Router/auth are deterministic story providers; navigation itself is the real product shell.
    const root = createRootRoute({ component: Outlet });
    const overview = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => (
        <SpecFlowShell auth={auth}>
          <OverviewFixtureContent state={state} interactive={interactive} operations={operations} />
        </SpecFlowShell>
      ),
    });
    const login = createRoute({
      getParentRoute: () => root,
      path: '/login',
      component: () => <LoginScreen auth={auth} />,
    });
    const playground = createRoute({
      getParentRoute: () => root,
      path: '/ui-playground',
      component: () => (
        <SpecFlowShell auth={auth}>
          <UiPlaygroundScreen />
        </SpecFlowShell>
      ),
    });
    return createRouter({
      routeTree: root.addChildren([overview, login, playground]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
  }, [state, interactive, operations]);
  return (
    <QueryClientProvider client={queryClient}>
      <StoryLocalization locale={locale}>
        <RouterProvider router={router} />
      </StoryLocalization>
    </QueryClientProvider>
  );
}

function OverviewFixtureContent({
  state,
  interactive,
  operations,
}: {
  state: SpecsOverviewState;
  interactive: boolean;
  operations?: readonly OperationListItem[];
}) {
  const operationsPanel = useMemo(
    () =>
      operations ? (
        <OperationsPanelHost
          api={operationsStub(operationList(operations))}
          listUrl="/api/specs/operations"
          kinds={[stubCreateKind]}
        />
      ) : undefined,
    [operations],
  );
  const [collectionOverride, setCollectionOverride] = useState<SpecsOverviewState>();
  const [target, setTarget] = useState<CurrentSpecTarget>();
  const [refreshes, setRefreshes] = useState(0);
  const [sessionStarts, setSessionStarts] = useState(0);
  return (
    <>
      <SpecsOverview
        state={collectionOverride ?? state}
        operationsPanel={operationsPanel}
        onCollectionChange={(collection) =>
          setCollectionOverride({
            collection,
            projection: createSpecsFixture(collection),
            loading: false,
            refreshing: false,
            error: false,
          })
        }
        onRefresh={() => setRefreshes((count) => count + 1)}
        onCreateSession={interactive ? () => setSessionStarts((count) => count + 1) : undefined}
        onOpenTarget={interactive ? setTarget : undefined}
        specificationHref={interactive ? (id) => `/specs/${id}` : undefined}
        renderSpecificationLink={
          interactive
            ? (specId, children, ariaLabel) => (
                <a
                  href={`/specs/${specId}`}
                  className={specPrimaryLinkClassName}
                  aria-label={ariaLabel}
                  data-focus-ring="delegated"
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    setTarget({ kind: 'specification', specId });
                  }}
                >
                  {children}
                </a>
              )
            : undefined
        }
      />
      <output className="sr-only" aria-label="Fixture interaction result">
        {JSON.stringify({ target, refreshes, sessionStarts })}
      </output>
    </>
  );
}

const loaded: SpecsOverviewState = {
  collection: 'current',
  projection: createSpecsFixture(),
  loading: false,
  refreshing: false,
  error: false,
};
const meta = {
  title: 'SpecFlow/Screens/Specs Overview',
  component: OverviewFixture,
  args: { state: loaded },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OverviewFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
const pullRequestContractPlay: NonNullable<Story['play']> = async ({
  canvas,
  canvasElement,
  userEvent,
}) => {
  const pr = canvas.getAllByRole('link', { name: /Open pull request/ })[0]!;
  let activated = 0;
  pr.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      activated++;
    },
    { once: true },
  );
  if (matchMedia('(pointer:coarse)').matches) {
    const rect = pr.getBoundingClientRect();
    if (rect.width < 44 || rect.height < 44)
      throw new Error('PR touch target must be at least44×44');
    const hit = canvasElement.ownerDocument.elementFromPoint(rect.right - 1, rect.bottom - 1);
    if (hit?.closest('a') !== pr)
      throw new Error('Near-edge PR target must not activate the stretched Specification link');
    await userEvent.click(hit);
  } else await userEvent.click(pr);
  if (
    activated !== 1 ||
    canvas.getByLabelText('Fixture interaction result').textContent?.includes('"target":')
  )
    throw new Error('PR activation must remain independent');
};
export const CurrentPullRequestContract: Story = {
  tags: ['contract', '!autodocs'],
  play: pullRequestContractPlay,
};
export const ArchivePullRequestContract: Story = {
  args: { state: { ...loaded, collection: 'archive', projection: createSpecsFixture('archive') } },
  tags: ['contract', '!autodocs'],
  play: pullRequestContractPlay,
};

export const Current: Story = {
  tags: ['visual'],
  parameters: { chromatic: { disableSnapshot: false } },
};

export const CurrentContract: Story = {
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('heading', { name: 'Requires attention' });
    canvas.getByRole('radio', { name: 'Current' });
    canvas.getByRole('radio', { name: 'Archive' });
    if (canvas.getByRole('button', { name: 'Specification actions' }).textContent?.trim())
      throw new Error('Header overflow should visibly contain only the ellipsis icon.');
    const headings = [...canvasElement.querySelectorAll('[data-spec-section-header] h2')];
    if (
      headings.map((element) => element.textContent).join('|') !==
      'Requires attention|Active|Ready|Draft'
    )
      throw new Error('Backend group order and frontend translations must be preserved.');
    if (canvasElement.querySelectorAll('[data-spec-id]').length !== 7)
      throw new Error('Every Specification appears exactly once.');
    if (canvas.queryByRole('checkbox')) throw new Error('Specs has no bulk-selection capability.');
    if (canvasElement.textContent?.includes('TASK-'))
      throw new Error('Raw Task IDs must not leak.');
    canvas.getByText('Agent input required');
    canvas.getByText(/1 session active/);
    canvas.getByText('1 active session');
    const titleEdges = [...canvasElement.querySelectorAll('[data-spec-title]')].map(
      (el) => el.getBoundingClientRect().left,
    );
    if (titleEdges.some((left) => Math.abs(left - titleEdges[0]!) > 1))
      throw new Error('Specification title axis drift.');
    const headerEdges = [...canvasElement.querySelectorAll('[data-spec-section-header] h2')].map(
      (el) => el.getBoundingClientRect().left,
    );
    if (headerEdges.some((left) => Math.abs(left - headerEdges[0]!) > 1))
      throw new Error('Section header axis drift.');
    const progressEdges = [...canvasElement.querySelectorAll('[data-spec-progress]')].map(
      (el) => el.getBoundingClientRect().left,
    );
    if (progressEdges.some((left) => Math.abs(left - progressEdges[0]!) > 1))
      throw new Error('Progress scan column drift.');
    const columns = canvasElement.querySelector('[data-spec-columns]');
    if (
      columns?.checkVisibility() &&
      Math.abs(columns.children[2]!.getBoundingClientRect().left - progressEdges[0]!) > 1
    )
      throw new Error('Collection headings must align with their scan tracks.');
    const metadata = canvasElement.querySelector<HTMLElement>('[data-spec-metadata]');
    if (!metadata || window.getComputedStyle(metadata).marginTop !== '4px')
      throw new Error('Identity metadata must stay directly under the title.');
    const destination = canvas.getByRole('link', {
      name: 'Open specification: Deterministic admission and execution boundaries',
    });
    if (destination.getAttribute('href') !== '/specs/admission')
      throw new Error('Navigation must expose a real href.');
    const row = destination.closest<HTMLElement>('[data-spec-id]');
    if (!row || window.getComputedStyle(row).borderRadius === '0px')
      throw new Error('Interactive row hover must share rounded focus geometry.');
    if (destination.getAttribute('data-focus-ring') !== 'delegated')
      throw new Error('Primary navigation must delegate focus to its stretched row surface.');
    await userEvent.hover(row);
    if (window.getComputedStyle(destination).textDecorationLine.includes('underline'))
      throw new Error('Whole-row hover should not imply that only the title is clickable.');
    await userEvent.unhover(row);
    await userEvent.click(destination);
    if (
      !canvas
        .getByLabelText('Fixture interaction result')
        .textContent?.includes('"specId":"admission"')
    )
      throw new Error('Specification navigation must preserve identity.');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Collapse Requires attention section' }),
    );
    if (
      canvas
        .getByRole('button', { name: 'Expand Requires attention section' })
        .getAttribute('aria-expanded') !== 'false'
    )
      throw new Error('Normal disclosure should collapse.');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Expand Requires attention section' }),
    );
  },
};

export const AccountNavigation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Demo/ }));
    const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="User menu"]');
    if (menu?.querySelectorAll('[role="menuitemradio"]').length !== 2)
      throw new Error('Overview navigation must expose the real account and locale menu.');
    const signOut = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('Sign out'),
    );
    if (!signOut) throw new Error('Authenticated Overview must expose sign out.');
    await userEvent.click(signOut);
    await canvas.findByRole('heading', { name: 'Welcome back' });
  },
};

export const SpecLevelAttention: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: [createSpecsFixture().items[1]!] },
    },
  },
};
export const Ready: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: [createSpecsFixture().items[3]!] },
    },
  },
};
export const BatchWorking: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: [createSpecsFixture().items[4]!] },
    },
  },
};
export const SingleTaskWorking: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...loaded.projection!,
        items: [
          createSpecItem({
            ...createSpecsFixture().items[4]!,
            currentExecutions: [
              { sessionId: 'single', agentRole: 'Implementer', taskIds: ['TASK-02'] },
            ],
          }),
        ],
      },
    },
  },
};
export const ReadyAndDraft: Story = {
  args: {
    state: {
      ...loaded,
      projection: { ...loaded.projection!, items: createSpecsFixture().items.slice(5) },
    },
  },
};
/**
 * A project Runtime that knows the specifications but not their work status or progress: ONE flat
 * list (name, key facts, when it was updated), no group of "unavailable" and no empty columns.
 * The choice is data-driven: it follows what the Runtime provides, not the runtime mode.
 */
const noStatus = (id: string, title: string, extra: Parameters<typeof createSpecItem>[0] = {}) =>
  createSpecItem({
    id,
    title,
    classification: { section: 'unknown' },
    progress: null,
    signals: null,
    currentExecutions: null,
    ...extra,
  });
const flatState: SpecsOverviewState = {
  ...loaded,
  projection: {
    ...createSpecsFixture(),
    sections: ['unknown'],
    items: [
      noStatus('a', 'Payment limits', { key: 'PAY-12', updatedAt: '2026-10-20T09:00:00Z' }),
      noStatus('b', 'Audit trail', { tags: ['Runtime'], updatedAt: '2026-10-12T09:00:00Z' }),
      noStatus('c', 'Offline mode', { updatedAt: '2026-09-30T09:00:00Z' }),
    ],
  },
};
export const FlatListWithoutStatus: Story = {
  args: { state: flatState },
  tags: ['visual'],
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('link', { name: 'Open specification: Payment limits' });
    await expect(canvasElement.querySelector('[data-spec-layout="flat"]')).not.toBeNull();
    await expect(canvas.queryByText('Status unavailable')).toBeNull();
    await expect(canvas.queryByText('Work status not available yet')).toBeNull();
    // Only the columns of what exists: the specification and when it was last updated.
    await expect(canvasElement.querySelector('[data-spec-columns]')).toHaveTextContent(
      'SpecificationUpdated',
    );
    await expect(canvas.queryByRole('button', { name: /Specification actions: / })).toBeNull();
  },
};
/**
 * Exactly what a project Runtime provides today (no key, tags, pull requests, progress or work
 * status): the title and when it was last updated, in the flat list's own columns.
 */
const projectRuntimeState: SpecsOverviewState = {
  ...loaded,
  projection: {
    ...createSpecsFixture(),
    sections: ['requires-attention', 'active', 'ready', 'draft', 'unknown'],
    items: [
      ['logowanie-sso', 'Logowanie SSO', '2026-10-28T18:54:17Z'],
      ['limity', 'Limity płatności w trybie offline', '2026-10-27T09:12:00Z'],
      [
        'eksport',
        'Eksport raportów miesięcznych do formatu CSV z podziałem na zespoły i projekty',
        '2026-09-30T14:00:00Z',
      ],
    ].map(([id, title, updatedAt]) =>
      noStatus(id!, title!, { key: undefined, tags: [], pullRequests: [], updatedAt }),
    ),
  },
};
export const ProjectRuntimeList: Story = {
  args: { state: projectRuntimeState, locale: 'pl' },
  tags: ['visual'],
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('link', { name: 'Otwórz specyfikację: Logowanie SSO' });
    await expect(canvasElement.querySelectorAll('[data-spec-updated] time')).toHaveLength(3);
    await expect(canvasElement.querySelector('[data-spec-metadata]')).toBeNull();
  },
};
export const ProjectRuntimeListMobile: Story = {
  args: { state: projectRuntimeState, locale: 'pl' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
/** Only progress exists: the flat list keeps one progress column, still no status column. */
export const FlatListWithProgressOnly: Story = {
  args: {
    state: {
      ...flatState,
      projection: {
        ...flatState.projection!,
        items: (flatState.projection!.items as ReturnType<typeof createSpecItem>[]).map(
          (item, index) => ({ ...item, progress: { completed: index, total: 4 } }),
        ),
      },
    },
  },
};
export const FlatListMobile: Story = {
  args: { state: flatState },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const FlatListPolish: Story = { args: { state: flatState, locale: 'pl' } };
/** Real status data: grouped by status, with the situation and progress columns. */
export const GroupedByStatus: Story = {
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('heading', { name: 'Requires attention' });
    await expect(canvasElement.querySelector('[data-spec-layout="grouped"]')).not.toBeNull();
  },
};
export const Loading: Story = {
  args: { state: { collection: 'current', loading: true, refreshing: false, error: false } },
};
export const EmptyCurrent: Story = {
  args: { state: { ...loaded, projection: { ...loaded.projection!, items: [] } } },
};
export const EmptyArchive: Story = {
  args: {
    state: {
      ...loaded,
      collection: 'archive',
      projection: { ...createSpecsFixture('archive'), items: [] },
    },
  },
};
export const Unavailable: Story = {
  args: { state: { collection: 'current', loading: false, refreshing: false, error: true } },
};
export const Refreshing: Story = { args: { state: { ...loaded, refreshing: true } } };
export const RefreshFailure: Story = { args: { state: { ...loaded, error: true } } };
export const Archive: Story = {
  args: { state: { ...loaded, collection: 'archive', projection: createSpecsFixture('archive') } },
  tags: ['visual'],
  parameters: { chromatic: { disableSnapshot: false } },
};

/** Full metadata is the normal Archive visual fixture; incomplete records are tested separately. */
export const ArchiveWithCompleteMetadata: Story = {
  ...Archive,
  play: async ({ canvasElement }) => {
    // RouterProvider can finish its initial route after Storybook starts play.
    // Check the final DOM instead of failing during asynchronous initialization.
    // Off-screen rows remain in the DOM; scrolling does not affect the count.
    await waitFor(
      () => {
        const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-spec-id]')];
        if (rows.length !== 18)
          throw new Error(`Expected all 18 archived specifications; found ${rows.length}.`);
        if (rows.some((row) => !row.getAttribute('data-spec-key')))
          throw new Error('Archive fixture must render a stable Specification key on every row.');
        if (rows.some((row) => !row.querySelector('[data-spec-metadata]')))
          throw new Error('Archive fixture should cover tags and linked PR metadata.');
      },
      { timeout: 5000 },
    );
  },
};

export const ArchiveMissingOptionalMetadata: Story = {
  args: {
    state: {
      ...loaded,
      collection: 'archive',
      projection: {
        ...createSpecsFixture('archive'),
        items: [
          createArchiveItem({
            id: 'legacy-import',
            key: undefined,
            tags: [],
            pullRequests: [],
            title: 'Imported archive without optional identifiers',
          }),
        ],
      },
    },
  },
  play: ({ canvasElement }) => {
    const row = canvasElement.querySelector<HTMLElement>('[data-spec-id="legacy-import"]');
    if (!row || row.getAttribute('data-spec-key') || row.querySelector('[data-spec-metadata]')) {
      throw new Error('Legacy record must not fabricate absent optional metadata.');
    }
  },
};

export const ArchiveContract: Story = {
  args: { state: { ...loaded, collection: 'archive', projection: createSpecsFixture('archive') } },
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const search = canvas.getByRole('textbox', { name: 'Search specifications' });
    await userEvent.type(search, 'canonical');
    if (canvas.queryByText('Requires attention'))
      throw new Error('Archive must remain historical.');
    await userEvent.click(search);
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.type(search, 'does-not-exist');
    canvas.getByText('No matching specifications');
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }));
    canvas.getByText('Canonical Session, Turn and Work model');
  },
};

export const CollectionSwitch: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('radio', { name: 'Archive' }));
    canvas.getByRole('textbox', { name: 'Search specifications' });
    if (canvas.queryByText('Requires attention'))
      throw new Error('Current signals cannot leak into Archive.');
    await userEvent.click(canvas.getByRole('radio', { name: 'Current' }));
    canvas.getByText('Requires attention');
    await userEvent.click(canvas.getByRole('button', { name: 'Specification actions' }));
    const refresh = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Refresh',
    );
    if (!refresh) throw new Error('Refresh should be available in the owning header menu.');
    if (!refresh.querySelector('svg')) throw new Error('Refresh must have its semantic icon.');
    await userEvent.click(refresh);
    if (!canvas.getByLabelText('Fixture interaction result').textContent?.includes('"refreshes":1'))
      throw new Error('Refresh must notify the collection owner.');
    await userEvent.click(canvas.getByRole('button', { name: 'Specification actions' }));
    const createSession = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Create session',
    );
    if (!createSession?.querySelector('svg'))
      throw new Error('Create session must expose a semantic icon.');
    await userEvent.click(createSession);
    if (
      !canvas
        .getByLabelText('Fixture interaction result')
        .textContent?.includes('"sessionStarts":1')
    )
      throw new Error('Session start must notify the application owner.');
  },
};
export const LongContent: Story = {
  args: { state: { ...loaded, projection: createLongContentFixture() } },
};
/**
 * A Create that is running: the operations panel sits above the list (rendered from API data, no
 * client-side ledger) and its row leads to the progress page.
 */
export const CreatingInProgress: Story = {
  args: {
    operations: [runningItem(1, { title: 'Limity płatności', operationId: 'op-1' })],
  },
  play: async ({ canvas }) => {
    const link = await canvas.findByRole('link', { name: /^Limity płatności/ });
    await expect(link).toHaveAttribute('href', '/specs/new/creating/op-1');
    await expect(link).toHaveTextContent('Step 2 of 4');
    await expect(canvas.getByRole('region', { name: 'Background operations' })).toBeVisible();
  },
};

/** The panel at 320 px with a long name and a check-result row: it wraps and nothing scrolls sideways. */
export const CreatingInProgressMobile: Story = {
  args: {
    operations: [
      runningItem(2, {
        title:
          'Ograniczenia płatności cyklicznych dla klientów korporacyjnych w kanałach zdalnych oraz integracji z dostawcami',
      }),
      operationItem({ status: 'recovery-required', title: 'Faktury' }),
    ],
  },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    const links = await canvas.findAllByRole('link', { name: /Background|,/ });
    for (const link of links)
      await expect(link.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
  },
};
export const Polish: Story = { args: { locale: 'pl' } };
export const ProgressStates: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...createSpecsFixture(),
        items: [0, 1, 9, 10, 17, 18, 19, 20, 100, 10000].map((total, index) =>
          createSpecItem({
            id: `progress-${total}`,
            title: `Aggregate task completion — ${total} tasks`,
            progress: { total, completed: index % 2 ? total : Math.floor(total / 2) },
            classification: {
              section: 'requires-attention',
              ...(index % 3 ? { reason: 'review' as const } : {}),
            },
            currentExecutions: [],
          }),
        ),
      },
    },
  },
  tags: ['contract', '!autodocs'],
  play: ({ canvas, canvasElement }) => {
    canvas.getByText('No tasks yet');
    if (canvasElement.querySelector('[data-spec-id="progress-0"] [role="progressbar"]'))
      throw new Error('Zero tasks has no determinate bar.');
    const row = canvasElement.querySelector('[data-spec-id="progress-9"]')!;
    const children = row.querySelector('[data-spec-title]')?.parentElement?.parentElement?.children;
    if (
      !children ||
      !children[1]?.hasAttribute('data-spec-progress') ||
      !children[2]?.hasAttribute('data-spec-summary')
    )
      throw new Error('Logical mobile order must be identity, progress, situation.');
    if (!canvasElement.querySelector('[data-spec-id="progress-1"] [data-spec-summary]'))
      throw new Error('Completion cannot remove human attention.');
  },
};
export const InvalidArchiveDates: Story = {
  args: {
    state: {
      ...loaded,
      collection: 'archive',
      projection: {
        ...createSpecsFixture('archive'),
        items: [
          createArchiveItem({
            id: 'invalid-completed',
            title: 'Malformed completion date',
            completedAt: 'invalid',
            archivedAt: '2026-10-01',
          }),
          createArchiveItem({
            id: 'invalid-archived',
            title: 'Malformed archive date',
            archivedAt: 'invalid',
          }),
        ],
      },
    },
  },
  tags: ['contract', '!autodocs'],
  play: ({ canvas, canvasElement }) => {
    canvas.getAllByText('Date unavailable');
    const row = canvasElement.querySelector('[data-spec-id="invalid-completed"]')!;
    if (!row.textContent?.includes('Completed') || row.querySelector('time'))
      throw new Error(
        'Completion evidence survives an invalid date without manufacturing another milestone.',
      );
    if (
      canvasElement.querySelector('[role="progressbar"]') ||
      canvasElement.querySelector('[data-spec-progress]')
    )
      throw new Error('Archive has no operational progress.');
  },
};
export const MetadataOverflow: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...createLongContentFixture(),
        items: [
          createSpecItem({
            ...createLongContentFixture().items[0]!,
            pullRequests: [27, 31, 34].map((number) => ({
              number,
              url: `https://example.test/pull/${number}`,
            })),
            tags: [
              'Very long stable product area label with realistic content',
              'Runtime',
              'Provider',
              'Auth',
            ],
          }),
        ],
      },
    },
  },
  play: ({ canvas, canvasElement }) => {
    canvas.getByText('3 PRs');
    if (canvas.queryByRole('link', { name: /Open pull request/ }))
      throw new Error('Multiple PRs must never choose a representative link.');
    if (canvasElement.textContent?.includes('TASK-'))
      throw new Error('Source-specific Task text must stay out of bounded rows.');
  },
};

export const SearchDisclosure: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...createSpecsFixture(),
        items: [
          ...createSpecsFixture().items,
          ...Array.from({ length: 7 }, (_, index) =>
            createSpecItem({ id: `draft-${index}`, title: `Planning draft ${index}` }),
          ),
        ],
      },
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Collapse Requires attention section' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Draft section' }));
    const search = canvas.getByRole('textbox', { name: 'Search specifications' });
    await userEvent.type(search, 'Deterministic');
    const forced = canvas.getByRole('button', {
      name: 'Requires attention section expanded while search is active',
    });
    if (
      forced.getAttribute('aria-expanded') !== 'true' ||
      forced.getAttribute('aria-disabled') !== 'true'
    )
      throw new Error('Search must force accessible expanded, disabled disclosure.');
    await userEvent.click(forced);
    forced.focus();
    await userEvent.keyboard('{Enter} ');
    if (
      !canvas
        .getByRole('link', {
          name: 'Open specification: Deterministic admission and execution boundaries',
        })
        .checkVisibility()
    )
      throw new Error('Search matches must remain visible.');
    if (canvasElement.querySelectorAll('[data-spec-section-header]').length !== 1)
      throw new Error('Zero-match sections must be omitted.');
    const section = forced.closest('section')!;
    if (!section.querySelector('[data-spec-section-header]')?.textContent?.includes('1'))
      throw new Error('Filtered section counts must reflect matches.');
    await userEvent.type(search, 'does-not-exist', {
      initialSelectionStart: 0,
      initialSelectionEnd: 100,
    });
    canvas.getByText('No matching specifications');
    await userEvent.type(search, 'Runtime', { initialSelectionStart: 0, initialSelectionEnd: 100 });
    canvas.getByRole('button', {
      name: 'Requires attention section expanded while search is active',
    });
    await userEvent.clear(search);
    canvas.getByRole('button', { name: 'Expand Requires attention section' });
    canvas.getByRole('button', { name: 'Expand Draft section' });
    canvas.getByRole('button', { name: 'Collapse Active section' });
    canvas.getByRole('button', { name: 'Collapse Ready section' });
  },
};

export const MissingKey: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...createSpecsFixture(),
        items: createSpecsFixture().items.map((item, index) => ({
          ...item,
          key: index === 1 ? undefined : item.key,
        })),
      },
    },
  },
  play: CurrentContract.play,
};

export const ArchiveLifecycle: Story = {
  args: {
    state: {
      ...loaded,
      collection: 'archive',
      projection: {
        revision: 'lifecycle-fixture',
        collection: 'archive',
        items: [
          createArchiveItem({
            id: 'completed',
            title: 'Completed specification',
            completedAt: '2026-09-22T14:00:00Z',
            updatedAt: '2099-01-01T00:00:00Z',
          }),
          createArchiveItem({
            id: 'archived',
            title: 'Archived specification',
            archivedAt: '2026-09-25T09:00:00Z',
          }),
          createArchiveItem({
            id: 'both',
            title: 'Completed then archived',
            completedAt: '2026-09-22T14:00:00Z',
            archivedAt: '2026-09-25T09:00:00Z',
          }),
          createArchiveItem({
            id: 'undated',
            title: 'Imported historical specification',
            updatedAt: '2099-01-01T00:00:00Z',
          }),
        ],
      },
    },
  },
  play: ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll('[data-spec-id]');
    const history = (id: string) =>
      canvasElement.querySelector(`[data-spec-id="${id}"] [data-spec-summary]`);
    if (
      !history('completed')?.textContent?.includes('Sep 22, 2026') ||
      !history('archived')?.textContent?.includes('Sep 25, 2026') ||
      !history('both')?.textContent?.includes('Sep 22, 2026') ||
      !history('both')?.textContent?.includes('Completed') ||
      rows[0]?.getAttribute('data-spec-id') !== 'archived'
    )
      throw new Error('Authoritative lifecycle timestamps must drive Archive history.');
    if (rows[3]?.querySelector('time') || !rows[3]?.textContent?.includes('Archived'))
      throw new Error('Undated Archive membership must not invent completion/date.');
    if (
      canvasElement.textContent?.includes('2099') ||
      canvasElement.querySelector('[data-spec-section-header]')
    )
      throw new Error('Archive must not use update timestamps or Current sections.');
  },
};

export const Dense: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...createSpecsFixture(),
        items: Array.from({ length: 42 }, (_, index) =>
          createSpecItem({
            ...createSpecsFixture().items[index % 7]!,
            id: `dense-${index}`,
            title: `${createSpecsFixture().items[index % 7]!.title} — phase ${index + 1}`,
          }),
        ),
      },
    },
  },
};

export const ConfiguredOrder: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...createSpecsFixture(),
        sections: ['draft', 'active'],
        items: createSpecsFixture().items.filter(
          (item) =>
            item.classification.section === 'draft' || item.classification.section === 'active',
        ),
      },
    },
  },
  play: ({ canvasElement }) => {
    const sections = [...canvasElement.querySelectorAll('[data-spec-section-header] h2')].map(
      (element) => element.textContent,
    );
    if (sections.join('|') !== 'Draft|Active')
      throw new Error('Frontend must render server-supplied section availability and order.');
  },
};
export const ReadOnlyPreview: Story = {
  args: { interactive: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Specification actions' }));
    const createSession = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Create session',
    );
    if (createSession?.getAttribute('aria-disabled') !== 'true')
      throw new Error('Session creation must remain disabled without the owner capability.');
    await userEvent.keyboard('{Escape}');
  },
};
export const Mobile: Story = {
  ...LongContent,
  tags: ['visual'],
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  parameters: { chromatic: { disableSnapshot: false } },
};

export const SourceLifecycle: Story = {
  render: () => <SourceLifecycleFixture />,
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('status', { name: 'Loading specifications' });
    await userEvent.click(canvas.getByRole('radio', { name: 'Archive' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Current' }));
    if (canvas.queryByText('Requires attention'))
      throw new Error('A late Current response must not leak into Archive.');
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Archive' }));
    await canvas.findByText('Canonical Session, Turn and Work model');
    await userEvent.click(canvas.getByRole('button', { name: 'Specification actions' }));
    const refresh = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Refresh',
    );
    if (!refresh) throw new Error('Missing scoped refresh.');
    await userEvent.click(refresh);
    canvas.getByText('Canonical Session, Turn and Work model');
    await userEvent.click(canvas.getByRole('button', { name: 'Fail Archive' }));
    await canvas.findByRole('alert');
    canvas.getByText('Canonical Session, Turn and Work model');
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Archive' }));
    await canvas.findByText('Canonical Session, Turn and Work model');
    if (canvas.queryByRole('alert')) throw new Error('Successful retry must clear the error.');
  },
};

export const InvalidSourceAggregate: Story = {
  tags: ['integration', '!autodocs'],
  render: () => <SourceLifecycleFixture />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve invalid Current' }));
    await canvas.findByRole('alert');
    if (canvasElement.querySelector('[data-spec-id]'))
      throw new Error(
        'Invalid producer aggregates must enter source failure, not clamp the facts.',
      );
  },
};
