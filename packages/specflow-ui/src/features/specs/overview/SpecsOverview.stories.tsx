import { useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
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
import { createLongContentFixture, createSpecItem, createSpecsFixture } from './fixtures';
import type {
  SpecsCollection,
  SpecsOverviewProjection,
  SpecsOverviewSource,
  SpecsOverviewState,
  SteeringTarget,
} from './model';
import { SpecsOverview } from './SpecsOverview';
import { useSpecsOverview } from './useSpecsOverview';

function SourceLifecycleFixture() {
  const [collection, setCollection] = useState<SpecsCollection>('active');
  const pending = useRef<
    {
      collection: SpecsCollection;
      resolve: (value: SpecsOverviewProjection) => void;
      reject: (error: Error) => void;
    }[]
  >([]);
  const source = useMemo<SpecsOverviewSource>(
    () => ({
      read: (scope) =>
        new Promise((resolve, reject) => {
          // Deliberately ignores cancellation: the owner must also guard late responses.
          pending.current.push({ collection: scope, resolve, reject });
        }),
    }),
    [],
  );
  const { state, refresh } = useSpecsOverview(source, collection);
  const settle = (scope: SpecsCollection, failure = false) => {
    const request = pending.current.findLast((item) => item.collection === scope);
    if (!request) throw new Error('Expected a pending collection request.');
    if (failure) request.reject(new Error('Fixture unavailable'));
    else request.resolve(createSpecsFixture(scope));
  };
  return (
    <StoryLocalization locale="en">
      <div className="h-dvh">
        <AppShell navigation={<Typography className="p-4">Specs</Typography>}>
          <SpecsOverview state={state} onCollectionChange={setCollection} onRefresh={refresh} />
        </AppShell>
      </div>
      <div className="flex gap-4 p-4" aria-label="Source test controls">
        <button type="button" onClick={() => settle('active')}>
          Resolve Active
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
}: {
  state: SpecsOverviewState;
  locale?: AppLocale;
  interactive?: boolean;
}) {
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
          <OverviewFixtureContent state={state} interactive={interactive} />
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
  }, [state, interactive]);
  return (
    <StoryLocalization locale={locale}>
      <RouterProvider router={router} />
    </StoryLocalization>
  );
}

function OverviewFixtureContent({
  state,
  interactive,
}: {
  state: SpecsOverviewState;
  interactive: boolean;
}) {
  const [collectionOverride, setCollectionOverride] = useState<SpecsOverviewState>();
  const [target, setTarget] = useState<SteeringTarget>();
  const [refreshes, setRefreshes] = useState(0);
  const [sessionStarts, setSessionStarts] = useState(0);
  return (
    <>
      <SpecsOverview
        state={collectionOverride ?? state}
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
      />
      <output className="sr-only" aria-label="Fixture interaction result">
        {JSON.stringify({ target, refreshes, sessionStarts })}
      </output>
    </>
  );
}

const loaded: SpecsOverviewState = {
  collection: 'active',
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

export const Active: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('heading', { name: 'Requires attention' });
    const headings = [...canvasElement.querySelectorAll('[data-spec-group-header] h2')];
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
    const edges = [
      ...canvasElement.querySelectorAll('[data-spec-title], [data-spec-group-header] h2'),
    ].map((el) => el.getBoundingClientRect().left);
    if (edges.some((left) => Math.abs(left - edges[0]!) > 1))
      throw new Error('Shared content axis drift.');
    const progressEdges = [...canvasElement.querySelectorAll('[data-spec-progress]')].map(
      (el) => el.getBoundingClientRect().left,
    );
    if (progressEdges.some((left) => Math.abs(left - progressEdges[0]!) > 1))
      throw new Error('Progress scan column drift.');
    const secondary = canvasElement.querySelector<HTMLElement>('[data-spec-secondary]');
    if (!secondary || window.getComputedStyle(secondary).columnGap !== '8px')
      throw new Error('Secondary fields should use compact token spacing.');
    const destination = canvas.getByRole('link', {
      name: 'Open specification: Deterministic admission and execution boundaries',
    });
    if (destination.getAttribute('href') !== '/specs/admission')
      throw new Error('Navigation must expose a real href.');
    await userEvent.click(destination);
    if (
      !canvas
        .getByLabelText('Fixture interaction result')
        .textContent?.includes('"specId":"admission"')
    )
      throw new Error('Specification navigation must preserve identity.');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Collapse Requires attention group' }),
    );
    if (
      canvas
        .getByRole('button', { name: 'Expand Requires attention group' })
        .getAttribute('aria-expanded') !== 'false'
    )
      throw new Error('Normal disclosure should collapse.');
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Requires attention group' }));
  },
};

export const AccountNavigation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open user menu for Demo' }));
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
export const Loading: Story = {
  args: { state: { collection: 'active', loading: true, refreshing: false, error: false } },
};
export const EmptyActive: Story = {
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
  args: { state: { collection: 'active', loading: false, refreshing: false, error: true } },
};
export const Refreshing: Story = { args: { state: { ...loaded, refreshing: true } } };
export const RefreshFailure: Story = { args: { state: { ...loaded, error: true } } };
export const PartialSignalFailure: Story = {
  args: {
    state: {
      ...loaded,
      projection: {
        ...loaded.projection!,
        items: [
          createSpecItem({ ...createSpecsFixture().items[0]!, steeringAvailable: false }),
          ...createSpecsFixture().items.slice(1),
        ],
      },
    },
  },
};
export const Archive: Story = {
  args: { state: { ...loaded, collection: 'archive', projection: createSpecsFixture('archive') } },
  play: async ({ canvas, userEvent }) => {
    const search = canvas.getByRole('textbox', { name: 'Search specs' });
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
    canvas.getByRole('textbox', { name: 'Search specs' });
    if (canvas.queryByText('Requires attention'))
      throw new Error('Active signals cannot leak into Archive.');
    await userEvent.click(canvas.getByRole('radio', { name: 'Active' }));
    canvas.getByText('Requires attention');
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
    const refresh = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Refresh',
    );
    if (!refresh) throw new Error('Refresh should be available in the owning header menu.');
    if (!refresh.querySelector('svg')) throw new Error('Refresh must have its semantic icon.');
    await userEvent.click(refresh);
    if (!canvas.getByLabelText('Fixture interaction result').textContent?.includes('"refreshes":1'))
      throw new Error('Refresh must notify the collection owner.');
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
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
export const Polish: Story = { args: { locale: 'pl' } };
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
      canvas.getByRole('button', { name: 'Collapse Requires attention group' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Draft group' }));
    const search = canvas.getByRole('textbox', { name: 'Search specs' });
    await userEvent.type(search, 'Deterministic');
    const forced = canvas.getByRole('button', {
      name: 'Requires attention group expanded while search is active',
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
    if (canvasElement.querySelectorAll('[data-spec-group-header]').length !== 1)
      throw new Error('Zero-match groups must be omitted.');
    const group = forced.closest('section')!;
    if (!group.querySelector('[data-spec-group-header]')?.textContent?.includes('1'))
      throw new Error('Filtered group counts must reflect matches.');
    await userEvent.type(search, 'does-not-exist', {
      initialSelectionStart: 0,
      initialSelectionEnd: 100,
    });
    canvas.getByText('No matching specifications');
    await userEvent.type(search, 'Runtime', { initialSelectionStart: 0, initialSelectionEnd: 100 });
    canvas.getByRole('button', {
      name: 'Requires attention group expanded while search is active',
    });
    await userEvent.clear(search);
    canvas.getByRole('button', { name: 'Expand Requires attention group' });
    canvas.getByRole('button', { name: 'Expand Draft group' });
    canvas.getByRole('button', { name: 'Collapse Active group' });
    canvas.getByRole('button', { name: 'Collapse Ready group' });
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
  play: Active.play,
};

export const ArchiveLifecycle: Story = {
  args: {
    state: {
      ...loaded,
      collection: 'archive',
      projection: {
        revision: 'lifecycle-fixture',
        collection: 'archive',
        groups: [],
        items: [
          createSpecItem({
            id: 'completed',
            title: 'Completed specification',
            completedAt: '2026-09-22T14:00:00Z',
            updatedAt: '2099-01-01T00:00:00Z',
          }),
          createSpecItem({
            id: 'archived',
            title: 'Archived specification',
            archivedAt: '2026-09-25T09:00:00Z',
          }),
          createSpecItem({
            id: 'both',
            title: 'Completed then archived',
            completedAt: '2026-09-22T14:00:00Z',
            archivedAt: '2026-09-25T09:00:00Z',
          }),
          createSpecItem({
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
    if (
      !rows[0]?.textContent?.includes('Completed Sep 22, 2026') ||
      !rows[1]?.textContent?.includes('Archived Sep 25, 2026') ||
      !rows[2]?.textContent?.includes('Completed Sep 22, 2026')
    )
      throw new Error('Authoritative lifecycle timestamps must drive Archive history.');
    if (rows[3]?.querySelector('time') || !rows[3]?.textContent?.includes('Archived'))
      throw new Error('Undated Archive membership must not invent completion/date.');
    if (
      canvasElement.textContent?.includes('2099') ||
      canvasElement.querySelector('[data-spec-group-header]')
    )
      throw new Error('Archive must not use update timestamps or Active groups.');
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
        groups: [
          { id: 'draft', order: 10 },
          { id: 'active', order: 20 },
        ],
      },
    },
  },
  play: ({ canvasElement }) => {
    const groups = [...canvasElement.querySelectorAll('[data-spec-group-header] h2')].map(
      (element) => element.textContent,
    );
    if (groups.join('|') !== 'Draft|Active')
      throw new Error('Frontend must render server-supplied group availability and order.');
  },
};
export const ReadOnlyPreview: Story = {
  args: { interactive: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
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
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const SourceLifecycle: Story = {
  render: () => <SourceLifecycleFixture />,
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('status', { name: 'Loading specifications' });
    await userEvent.click(canvas.getByRole('radio', { name: 'Archive' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Active' }));
    if (canvas.queryByText('Requires attention'))
      throw new Error('A late Active response must not leak into Archive.');
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve Archive' }));
    await canvas.findByText('Canonical Session, Turn and Work model');
    await userEvent.click(canvas.getByRole('button', { name: 'Specs actions' }));
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
