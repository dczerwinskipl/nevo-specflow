import { useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { browserPage } from '../../../test-support/browserPage';
import { expect, waitFor, within } from 'storybook/test';
import { HttpClientError } from '@nevo/http-client';
import type { DemoCatalogue, DemoCreateRequest } from '@nevo/specflow-contracts/demo';
import { catalogue } from './options/creationCatalogue.stories-support';
import {
  createdSpecFixture,
  createOptionsFixture,
  workspaceIds,
  type OptionsVariant,
} from './options/creationOptions.stories-support';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecFlowAppServices } from '../../../services';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
import { withLocale } from '../../../i18n/StoryLocalization';
/** Requests the form sent through the `create` seam (reset by every Fixture mount). */
export const createRequests: DemoCreateRequest[] = [];
/** How many create requests the fixture has answered (resolved or rejected), to wait on instead of sleeping. */
export const createAnswers = { count: 0 };
/** How the fixture answers `create`; every failure keeps the operation retryable except the last two. */
export type CreateBehavior =
  | 'ok'
  | 'lost-ack'
  | 'branch-exists'
  | 'stale-workspace'
  | 'integration-target-unavailable'
  | 'base-ref-unavailable'
  | 'operation-conflict'
  | 'forbidden'
  | 'timeout'
  | 'failed'
  | 'recovery-required'
  | 'branch-protected'
  | 'commit-blocked'
  | 'commit-failed';
// Real Engine shape: `error` repeats the code; only demo-only codes carry a message.
const failure = (status: number, code: string, error: string = code) =>
  new HttpClientError(error, { kind: 'http', status, data: { error, code } });
const createFailures: Partial<Record<CreateBehavior, HttpClientError>> = {
  'branch-exists': failure(409, 'BRANCH_ALREADY_EXISTS'),
  'stale-workspace': failure(
    409,
    'DEMO_WORKSPACE_UNAVAILABLE',
    'Wybrane środowisko pracy nie jest już dostępne.',
  ),
  // The Engine reports an unusable integration target as plain CREATE_OPERATION_INVALID (400).
  'integration-target-unavailable': failure(400, 'CREATE_OPERATION_INVALID'),
  'base-ref-unavailable': failure(422, 'BASE_REF_NOT_FOUND'),
  // Authorization answers carry no `code`.
  forbidden: new HttpClientError('forbidden', {
    kind: 'http',
    status: 403,
    data: { error: 'forbidden' },
  }),
  // The browser gave up waiting (axios ECONNABORTED): the server may have committed already.
  timeout: new HttpClientError('timeout of 15000ms exceeded', {
    kind: 'network',
    code: 'ECONNABORTED',
  }),
  'operation-conflict': failure(409, 'CREATE_CONFLICT'),
  failed: new HttpClientError('Create failed', {
    kind: 'http',
    status: 400,
    data: { error: 'demo_invalid_selection' },
  }),
  'recovery-required': failure(503, 'CREATE_RECOVERY_REQUIRED'),
  // Git enabled: nothing created (422, 409) / files written but not committed (503).
  'branch-protected': failure(422, 'BRANCH_PROTECTED'),
  'commit-blocked': failure(409, 'COMMIT_BLOCKED'),
  'commit-failed': failure(503, 'COMMIT_FAILED'),
};
type OptionsBehavior = 'ok' | 'loading' | 'error' | 'forbidden';
function Fixture({
  loseCreateAck = false,
  catalogueFailure = false,
  catalogue: served = catalogue,
  optionsVariants = ['default'],
  optionsBehavior = 'ok',
  createBehavior = loseCreateAck ? 'lost-ack' : 'ok',
  failuresBeforeSuccess = 1,
  createDelayMs = 0,
  controls = false,
  optionsFailAfter,
  statusWithoutResult = false,
  firstStatus = 'recovery-required',
}: {
  loseCreateAck?: boolean;
  catalogueFailure?: boolean;
  catalogue?: DemoCatalogue;
  /** One variant per create-options read; the last one repeats (e.g. stale, then refreshed). */
  optionsVariants?: OptionsVariant[];
  optionsBehavior?: OptionsBehavior;
  createBehavior?: CreateBehavior;
  /** Failing create answers before the same operation succeeds. */
  failuresBeforeSuccess?: number;
  /** Slow create answer, to click twice while it is in flight. */
  createDelayMs?: number;
  /** Test controls that change the world underneath an open form (revision / options). */
  controls?: boolean;
  /** Create-options reads after this many succeed; the rest fail. */
  optionsFailAfter?: number;
  /** The operation status answers `completed` without its result. */
  statusWithoutResult?: boolean;
  /** What the first operation status read answers (later reads: completed). */
  firstStatus?: 'recovery-required' | 'not-started';
}) {
  const inputs = useRef<{ operationId: string }[]>([]),
    failedCatalogue = useRef(false),
    optionReads = useRef(0),
    statusReads = useRef(0),
    revision = useRef(served.revision),
    brokenOptions = useRef(optionsBehavior === 'error');
  useState(() => {
    createRequests.length = 0;
    createAnswers.count = 0;
  });
  const [reads, setReads] = useState({ catalogue: 0, options: 0 });
  const [calls, setCalls] = useState(0),
    [catalogueBroken, setCatalogueBroken] = useState(false);
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
    [],
  );
  const services = useMemo(
    () =>
      createSpecFlowAppServices({
        runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'demo' }) },
        demoCreationApi: {
          ...createSpecFlowAppServices().demoCreationApi,
          catalogue: () => {
            setReads((value) => ({ ...value, catalogue: value.catalogue + 1 }));
            return failedCatalogue.current
              ? Promise.reject(new Error('Catalogue unavailable'))
              : Promise.resolve({ ...served, revision: revision.current });
          },
          createOptions: () => {
            if (optionsBehavior === 'loading') return new Promise(() => undefined);
            if (optionsBehavior === 'forbidden')
              return Promise.reject(failure(403, 'forbidden', 'Brak uprawnień.'));
            if (brokenOptions.current)
              return Promise.reject(new Error('Create options unavailable'));
            if (optionsFailAfter !== undefined && optionReads.current >= optionsFailAfter) {
              optionReads.current += 1;
              setReads((value) => ({ ...value, options: value.options + 1 }));
              return Promise.reject(new Error('Create options unavailable'));
            }
            const variant =
              optionsVariants[Math.min(optionReads.current, optionsVariants.length - 1)]!;
            optionReads.current += 1;
            setReads((value) => ({ ...value, options: value.options + 1 }));
            return Promise.resolve(createOptionsFixture(variant));
          },
          create: (input) => {
            inputs.current.push(input);
            createRequests.push(structuredClone(input));
            setCalls((value) => value + 1);
            const attempt = inputs.current.length;
            const answer = () => {
              if (createBehavior === 'ok')
                return Promise.resolve(createdSpecFixture(input.operationId));
              if (attempt <= failuresBeforeSuccess)
                return Promise.reject(
                  createBehavior === 'lost-ack'
                    ? new Error('Lost create ACK')
                    : createFailures[createBehavior]!,
                );
              return Promise.resolve(createdSpecFixture(input.operationId));
            };
            const answered = () => {
              createAnswers.count += 1;
            };
            const settle = () => answer().finally(answered);
            return createDelayMs
              ? new Promise((resolve, reject) =>
                  setTimeout(() => void settle().then(resolve, reject), createDelayMs),
                )
              : settle();
          },
          operationStatus: (operationId) => {
            statusReads.current += 1;
            return Promise.resolve(
              statusReads.current < 2
                ? {
                    operationId,
                    status: firstStatus,
                    step: 'workspace-prepared',
                    workspaceId: workspaceIds.platform,
                    branch: 'feature/payments-v2',
                    updatedAt: '2026-10-20T14:32:08Z',
                  }
                : statusWithoutResult
                  ? { operationId, status: 'completed' as const }
                  : {
                      operationId,
                      status: 'completed' as const,
                      result: createdSpecFixture(operationId),
                    },
            );
          },
        },
        sessionsApi: {
          ...createSpecFlowAppServices().sessionsApi,
          allocate: () =>
            Promise.resolve({ sessionId: 'session', location: served.currentLocation }),
        },
      }),
    [createBehavior, failuresBeforeSuccess, optionsBehavior, optionsVariants, served],
  );
  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div role="note" aria-label="Żądania tworzenia" className="sr-only">
            {calls}:
            {calls >= 2 && inputs.current[0]?.operationId === inputs.current[1]?.operationId
              ? 'same'
              : 'initial'}
          </div>
          {controls && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  revision.current = `${served.revision}-next`;
                  void client.invalidateQueries({ queryKey: ['demo-creation-catalogue'] });
                }}
              >
                Zmień rewizję katalogu
              </button>
              <button
                onClick={() => void client.invalidateQueries({ queryKey: ['demo-create-options'] })}
              >
                Odśwież opcje w tle
              </button>
              <output aria-label="Odczyty">
                katalog:{reads.catalogue} opcje:{reads.options}
              </output>
            </div>
          )}
          {catalogueFailure && (
            <button
              onClick={() => {
                failedCatalogue.current = !failedCatalogue.current;
                setCatalogueBroken(failedCatalogue.current);
                void client.invalidateQueries({ queryKey: ['demo-creation-catalogue'] });
              }}
            >
              {catalogueBroken ? 'Przywróć katalog' : 'Wymuś błąd katalogu'}
            </button>
          )}
          <div style={{ width: '100%', height: '100vh' }}>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Projekt</div>} style={{ height: '100%', width: '100%' }}>
                <CreateSpecificationScreen
                  onCreated={() => undefined}
                  onProjectStarted={() => undefined}
                  onSession={() => undefined}
                  onBack={() => undefined}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </div>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}
const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Contracts/Creation Demo',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ChoiceAndConfiguration: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('button', { name: /Z agentem/ });
    await settleViewport();
    const cards = [
      canvas.getByRole('button', { name: /Z agentem/ }),
      canvas.getByRole('button', { name: /Samodzielnie/ }),
    ];
    await expect(
      Math.abs(cards[0]!.getBoundingClientRect().width - cards[1]!.getBoundingClientRect().width),
    ).toBeLessThan(1);
    for (const card of cards)
      await expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight);
    await settleViewport(390, 844);
    await userEvent.click(canvas.getByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Logowanie SSO',
    );
    // The UI never proposes or generates a branch name: the section only offers the three places.
    await expect(await canvas.findByRole('radio', { name: 'Nowe środowisko pracy' })).toBeChecked();
    await expect(
      canvas.queryByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText('Pliki do utworzenia')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Wgraj pliki' })).not.toBeInTheDocument();
    await settleViewport();
    await settleViewport(390, 844);
    await settleViewport(390, 844, () =>
      canvas.getByRole('button', { name: 'Utwórz specyfikację' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: /Zmień sposób pracy/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Z agentem/ }));
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Logowanie SSO',
    );
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'Wybierz model',
    );
    await settleViewport();
    await settleViewport(390, 844);
    await settleViewport(390, 844, () =>
      canvas.getByRole('button', { name: 'Utwórz i otwórz sesję' }),
    );
  },
};
export const ExplicitModelCapabilities: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Z agentem/ }));
    canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }).focus();
    // Name -> archetype radio group -> the two suggested documents -> first provider.
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    const focusedProvider = canvas.getByRole('radio', { name: /Codex/ });
    await expect(focusedProvider).toHaveFocus();
    await expect(
      Number.parseFloat(getComputedStyle(focusedProvider.closest('label')!).outlineWidth),
    ).toBeGreaterThanOrEqual(2);
    await settleViewport();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'codex model B' }),
    );
    await expect(canvas.queryByRole('radio', { name: 'Edit' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('radio', { name: 'Agent' })).toBeEnabled();
    await expect(canvas.queryByRole('combobox', { name: 'Effort' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: /Claude/ }));
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'Wybierz model',
    );
  },
};

export const LostCreateAcknowledgement: Story = {
  render: () => <Fixture loseCreateAck />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Z agentem/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'SSO recovery',
    );
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'codex model A' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Utwórz i otwórz sesję' }));
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeDisabled();
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeDisabled();
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await expect(canvas.getByLabelText('Żądania tworzenia')).toHaveTextContent('2:same');
  },
};
export const CatalogueFailureKeepsDraft: Story = {
  render: () => <Fixture catalogueFailure />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Zachowany szkic',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Wymuś błąd katalogu' }));
    await canvas.findByText('Konfiguracja jest niedostępna');
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Zachowany szkic',
    );
    await expect(canvas.getByRole('button', { name: 'Utwórz specyfikację' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Przywróć katalog' }));
    await expect(canvas.getByRole('button', { name: 'Utwórz specyfikację' })).toBeEnabled();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Zachowany szkic',
    );
  },
};

/* Data-blocked states (G11). The live demo catalogue cannot reach these, so each story serves a
 * fixture catalogue through the same `demoCreationApi.catalogue` seam as production. */
const provider = catalogue.providers[0]!;
const variant = (id: string, title: string, patch: Partial<typeof provider> = {}) => ({
  ...provider,
  id,
  title,
  mark: 'neutral' as const,
  ...patch,
});
const withProviders = (providers: DemoCatalogue['providers']): DemoCatalogue => ({
  ...catalogue,
  providers,
});
const fiveProviders = [
  variant('p1', 'Codex', { mark: 'codex' }),
  variant('p2', 'Claude', { mark: 'claude' }),
  variant('p3', 'Local adapter', { available: false, reason: 'Adapter nie jest skonfigurowany.' }),
  variant('p4', 'Zewnętrzny wykonawca z bardzo długą nazwą własną', { connection: 'api' }),
  variant('p5', 'Wykonawca-bez-łamania-wiersza-w-nazwie-dlugi-token', {
    connection: 'subscription',
  }),
];

type PlayContext = Parameters<NonNullable<Story['play']>>[0];
type Canvas = PlayContext['canvas'];
type UserEvent = PlayContext['userEvent'];
/** Opens the agent form; widths are then varied by the assertions below. */
async function openAgentForm(canvas: Canvas, userEvent: UserEvent) {
  await userEvent.click(await canvas.findByRole('button', { name: /Z agentem/ }));
  await canvas.findByRole('heading', { name: 'Co chcesz opisać?' });
}
async function settle(width: number) {
  await (await browserPage()).viewport(width, 900);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
async function expectNoOverflow(width: number) {
  await settle(width);
  const scroller = document.querySelector<HTMLElement>('.scroll-area-viewport');
  await expect(scroller ? scroller.scrollWidth <= scroller.clientWidth + 1 : true).toBe(true);
}
const providerCards = (canvas: Canvas) =>
  canvas
    .queryAllByRole('radio')
    .filter((element: HTMLElement) => element.getAttribute('name') === 'provider')
    .map((element: HTMLElement) => element.closest('label')!);
async function expectEqualRows(canvas: Canvas) {
  const rows = new Map<number, number[]>();
  for (const card of providerCards(canvas)) {
    const rect = card.getBoundingClientRect();
    rows.set(Math.round(rect.top), [...(rows.get(Math.round(rect.top)) ?? []), rect.height]);
  }
  for (const heights of rows.values())
    await expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
}

export const ZeroProviders: Story = {
  render: () => <Fixture catalogue={withProviders([])} />,
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    await expect(canvas.getByText('Brak dostępnych wykonawców.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Utwórz i otwórz sesję' })).toBeDisabled();
    for (const width of [390, 1440]) await expectNoOverflow(width);
  },
};
export const SingleProviderPreselected: Story = {
  render: () => <Fixture catalogue={withProviders([fiveProviders[0]!])} />,
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    await expect(canvas.getByRole('radio', { name: /Codex/ })).toBeChecked();
    for (const width of [390, 1440]) await expectNoOverflow(width);
  },
};
export const TwoProviders: Story = {
  render: () => <Fixture catalogue={withProviders(fiveProviders.slice(0, 2))} />,
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    await settle(1440);
    const [first, second] = providerCards(canvas).map((card: HTMLElement) =>
      card.getBoundingClientRect(),
    );
    await expect(Math.abs(first!.top - second!.top)).toBeLessThan(1);
    await expectEqualRows(canvas);
    await settle(390);
    const stacked = providerCards(canvas).map((card: HTMLElement) => card.getBoundingClientRect());
    await expect(stacked[1]!.top).toBeGreaterThan(stacked[0]!.bottom - 1);
    await expectNoOverflow(390);
  },
};
export const ThreeProvidersNoOrphan: Story = {
  render: () => <Fixture catalogue={withProviders(fiveProviders.slice(0, 3))} />,
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    await settle(1440);
    const tops = new Set(
      providerCards(canvas).map((card: HTMLElement) =>
        Math.round(card.getBoundingClientRect().top),
      ),
    );
    await expect(tops.size).toBe(1);
    await expect(canvas.getByText('Adapter nie jest skonfigurowany.')).toBeVisible();
    await expectEqualRows(canvas);
    await expectNoOverflow(390);
  },
};
export const FiveProvidersLongNames: Story = {
  render: () => <Fixture catalogue={withProviders(fiveProviders)} />,
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    for (const width of [320, 390, 768, 1440]) {
      await expectNoOverflow(width);
      await expectEqualRows(canvas);
    }
    await userEvent.click(canvas.getByRole('radio', { name: /Zewnętrzny wykonawca/ }));
    await expect(canvas.getByRole('radio', { name: /Zewnętrzny wykonawca/ })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: /Local adapter/ })).toBeDisabled();
  },
};
export const UnavailableProviderIsReadable: Story = {
  render: () => (
    <Fixture
      catalogue={withProviders([provider, variant('off', 'Local adapter', { available: false })])}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    await expect(canvas.getByText('Niedostępny w tym środowisku')).toBeVisible();
    await expect(canvas.getByRole('radio', { name: /Local adapter/ })).toBeDisabled();
    // No "unknown" filler lines for missing access / quota data on any card.
    await expect(canvas.queryByText('Limit nieznany')).toBeNull();
    await expect(canvas.queryByText('Sposób dostępu nieustalony')).toBeNull();
  },
};
/**
 * The Archetype section: the archetypes as a radio list, the default selected, its documents with
 * the preselected suggestions ticked; ticks are kept per archetype and sent with Create.
 */
export const ArchetypeChoiceAndDocuments: Story = {
  render: () => <Fixture />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    const group = canvas.getByRole('radiogroup', { name: 'Archetyp' });
    await expect(within(group).getByRole('radio', { name: /Feature/ })).toBeChecked();
    // Arrow keys select each archetype they move to (all transitions, both directions).
    within(group)
      .getByRole('radio', { name: /Feature/ })
      .focus();
    for (const [key, name] of [
      ['{ArrowDown}', /Minimal/],
      ['{ArrowDown}', /Feature/],
      ['{ArrowUp}', /Minimal/],
      ['{ArrowUp}', /Feature/],
    ] as const) {
      await userEvent.keyboard(key);
      await waitFor(() => expect(within(group).getByRole('radio', { name })).toBeChecked());
      await expect(within(group).getByRole('radio', { name })).toHaveFocus();
    }
    const documents = canvas.getByRole('group', { name: 'Dokumenty do utworzenia' });
    await expect(
      within(documents).getByText('Overview (overview.md) jest tworzony zawsze.'),
    ).toBeVisible();
    const decisions = within(documents).getByRole('checkbox', { name: /Decisions/ });
    await expect(decisions).toBeChecked();
    await expect(within(documents).getByRole('checkbox', { name: /Research/ })).not.toBeChecked();
    await userEvent.click(decisions);
    await userEvent.click(within(group).getByRole('radio', { name: /Minimal/ }));
    await expect(within(documents).queryByRole('checkbox')).toBeNull();
    await userEvent.click(within(group).getByRole('radio', { name: /Feature/ }));
    // Switching back restores the user's own ticks for that archetype.
    await expect(within(documents).getByRole('checkbox', { name: /Decisions/ })).not.toBeChecked();
    await userEvent.click(within(documents).getByRole('checkbox', { name: /Research/ }));
    await expect(canvas.queryByText(/[Ww]orkflow/)).toBeNull();
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(1));
    const body = lastRequest();
    await expect(body.archetypeId).toBe('feature');
    await expect(body.catalogueRevision).toBe(catalogue.revision);
    await expect(body.optionalDocumentIds).toEqual(['research']);
    for (const width of [390, 1440]) await expectNoOverflow(width);
  },
};
export const UnavailableNewWorkspaceWithReason: Story = {
  render: () => <Fixture optionsVariants={['git-disabled']} />,
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    const tile = await canvas.findByRole('radio', { name: 'Nowe środowisko pracy' });
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
    await expect(tile).not.toBeChecked();
    await expect(canvas.getByText('Wyłączone w konfiguracji projektu.')).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Bieżący katalog' })).toBeChecked();
    for (const width of [390, 1440]) await expectNoOverflow(width);
  },
};
export const SingleModeModel: Story = {
  render: () => (
    <Fixture
      catalogue={withProviders([
        {
          ...provider,
          models: [{ id: 'solo', title: 'Solo model', efforts: [], modes: ['agent'] }],
        },
      ])}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Solo model' }));
    await expect(canvas.queryByRole('radio', { name: 'Agent' })).not.toBeInTheDocument();
    await expect(canvas.getByText('Agent')).toBeVisible();
  },
};
export const SeparatorsOnlyBetweenRenderedSections: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    // Manual mode has no agent section: basics | archetype | git (the footer is pinned below).
    await expect(canvas.getAllByRole('separator')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: /Zmień sposób pracy/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Z agentem/ }));
    await expect(canvas.getAllByRole('separator')).toHaveLength(3);
  },
};

/* The workspace section at form level: request bodies, conflicts, uncertain and recovery. */
async function openManualForm(
  canvas: Canvas,
  userEvent: UserEvent,
  name = 'Nowa obsługa płatności',
) {
  await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
  await userEvent.type(await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' }), name);
  await canvas.findByRole('radio', { name: 'Nowe środowisko pracy' });
}
const lastRequest = () => createRequests.at(-1)!;
const submit = (canvas: Canvas) => canvas.getByRole('button', { name: 'Utwórz specyfikację' });

export const DefaultCreateSendsOnlyTheNewWorktreeKind: Story = {
  render: () => <Fixture />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeChecked();
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(1));
    const body = lastRequest();
    await expect(body.title).toBe('Nowa obsługa płatności');
    await expect(body.target).toEqual({ kind: 'new-worktree' });
    await expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(JSON.stringify(body)).not.toMatch(/baseRef|integrationTargetWorkspaceId|"branch"/);
    await expect(JSON.stringify(body)).not.toMatch(/requestId/);
  },
};

export const MainWorkspaceCreateHasNoTarget: Story = {
  render: () => <Fixture />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('radio', { name: 'Bieżący katalog' }));
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(1));
    await expect(lastRequest()).not.toHaveProperty('target');
  },
};

export const ExistingWorkspaceCreateSendsOnlyTheWorkspace: Story = {
  render: () => <Fixture />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('radio', { name: 'Istniejące środowisko pracy' }));
    await expect(submit(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wybierz środowisko pracy.', { selector: 'span' })).toBeVisible();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Środowisko pracy' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /feature\/platform/ }),
    );
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(1));
    await expect(lastRequest().target).toEqual({
      kind: 'existing',
      workspaceId: workspaceIds.platform,
    });
  },
};

export const OverridesAreSentOnlyForTheActiveTile: Story = {
  render: () => <Fixture />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: /Zmień ustawienia/ }));
    await userEvent.click(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }));
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
      'feature/payments-v2',
    );
    await userEvent.click(canvas.getByRole('radio', { name: 'Bieżący katalog' }));
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(1));
    // The remembered branch never leaks into the main-workspace request.
    await expect(lastRequest()).not.toHaveProperty('target');
  },
};

export const AgentPathKeepsAcceptedSectionOrderAndCta: Story = {
  render: () => <Fixture />,
  play: async ({ canvas, userEvent }) => {
    await openAgentForm(canvas, userEvent);
    const agent = canvas.getByText('Początkowa sesja agenta');
    const workspace = await canvas.findByRole('heading', { name: 'Gdzie chcesz pracować?' });
    await expect(
      agent.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Utwórz i otwórz sesję' })).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Utwórz specyfikację' })).toBeNull();
  },
};

export const OptionsLoadingBlocksCreateButNotTheName: Story = {
  render: () => <Fixture optionsBehavior="loading" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    const name = await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' });
    await userEvent.type(name, 'Szkic');
    await expect(name).toHaveValue('Szkic');
    await expect(canvas.getByText('Wczytujemy opcje środowiska pracy…')).toBeVisible();
    await expect(submit(canvas)).toBeDisabled();
    await expect(canvas.queryByRole('radio', { name: 'Nowe środowisko pracy' })).toBeNull();
    for (const width of [320, 390, 1440]) await expectNoOverflow(width);
  },
};

export const OptionsErrorKeepsTheDraft: Story = {
  render: () => <Fixture optionsBehavior="error" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Szkic',
    );
    await canvas.findByText('Nie udało się wczytać opcji środowiska pracy');
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue('Szkic');
    await expect(submit(canvas)).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
  },
};

export const OptionsForbiddenMakesTheFormReadOnly: Story = {
  render: () => <Fixture optionsBehavior="forbidden" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await canvas.findByText('Nie masz uprawnień do tworzenia specyfikacji', { selector: 'div' });
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeDisabled();
    await expect(submit(canvas)).toBeDisabled();
  },
};

export const BranchNameConflictKeepsTheFormAndFocusesTheField: Story = {
  render: () => <Fixture createBehavior="branch-exists" />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: /Zmień ustawienia/ }));
    await userEvent.click(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }));
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
      'feature/payments-v2',
    );
    await userEvent.click(submit(canvas));
    await canvas.findByText('Nazwa gałęzi jest zajęta');
    const input = canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' });
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
    await expect(canvas.queryByRole('button', { name: 'Spróbuj ponownie' })).toBeNull();
    const first = lastRequest().operationId;
    await userEvent.click(canvas.getByRole('button', { name: 'Użyj automatycznej nazwy' }));
    await expect(
      canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }),
    ).not.toBeChecked();
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    // A changed body is a new operation; switching the name off restored the default, so nothing is sent.
    await expect(lastRequest().operationId).not.toBe(first);
    await expect(lastRequest().target).toEqual({ kind: 'new-worktree' });
  },
};

export const StaleWorkspaceConflictRefreshPreservesTheForm: Story = {
  render: () => (
    <Fixture createBehavior="stale-workspace" optionsVariants={['default', 'platform-dirty']} />
  ),
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: /Zmień ustawienia/ }));
    await userEvent.click(
      canvas.getByRole('switch', { name: 'Scal później do innego środowiska' }),
    );
    await userEvent.click(canvas.getByRole('combobox', { name: 'Scal do' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /feature\/platform/ }),
    );
    await userEvent.click(submit(canvas));
    await canvas.findByText('Stan środowiska pracy zmienił się od otwarcia formularza');
    const refresh = canvas.getByRole('button', { name: 'Odśwież opcje' });
    await userEvent.click(refresh);
    await waitFor(() =>
      expect(
        canvas.getByText(/^Opcje odświeżone. Formularz zachowany/, { selector: '[role="status"]' }),
      ).toBeInTheDocument(),
    );
    // Nothing was reset: name, tile, switch and the now-invalid value stay and are flagged.
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
    await expect(
      canvas.getByRole('switch', { name: 'Scal później do innego środowiska' }),
    ).toBeChecked();
    await expect(canvas.getAllByText(/nie może już być celem scalenia/)[0]).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Scal do' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    // F-12: the conflict alert described the old options and disappears; the flagged field is
    // what needs attention now, so focus lands there instead of on the removed button.
    await expect(
      canvas.queryByText('Stan środowiska pracy zmienił się od otwarcia formularza'),
    ).toBeNull();
    await waitFor(() => expect(canvas.getByRole('combobox', { name: 'Scal do' })).toHaveFocus());
    await expect(submit(canvas)).toBeDisabled();
  },
};

export const UncertainOutcomeOffersOnlyTheSameOperation: Story = {
  render: () => <Fixture createBehavior="lost-ack" />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Sprawdzamy wynik tworzenia');
    await expect(canvas.queryByRole('button', { name: /Spróbuj ponownie/ })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Skopiuj dane operacji' })).toBeVisible();
    // F-05: one clear action; the alert itself carries no second "check" button.
    await expect(canvas.getAllByRole('button', { name: /^Sprawdź wynik/ })).toHaveLength(1);
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(createRequests[0]!.operationId).toBe(createRequests[1]!.operationId);
    await expect(createRequests[1]).toEqual(createRequests[0]);
  },
};

export const RecoveryRequiredLocksTheFormAndNeverCreatesAgain: Story = {
  render: () => <Fixture createBehavior="recovery-required" />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: /Zmień ustawienia/ }));
    await userEvent.click(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }));
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
      'feature/payments-v2',
    );
    await userEvent.click(submit(canvas));
    await canvas.findByText('Tworzenie wymaga dokończenia');
    for (const control of [
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
      canvas.getByRole('radio', { name: 'Nowe środowisko pracy' }),
    ])
      await expect(control).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: /Spróbuj ponownie/ })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Utwórz specyfikację' })).toBeNull();
    // The diagnostics only list what the client knows, plus the server stage once read.
    await userEvent.click(canvas.getByRole('button', { name: 'Dane diagnostyczne' }));
    await expect(canvas.getByText('Identyfikator operacji')).toBeVisible();
    await expect(canvas.getAllByText('feature/payments-v2').length).toBeGreaterThan(0);
    // F-05: a single "check" action (the alert has none besides the form's own button).
    await expect(canvas.getAllByRole('button', { name: /^Sprawdź (stan|wynik)/ })).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź stan operacji' }));
    await canvas.findByText('Operacja nadal wymaga dokończenia.');
    // F-05: a readable stage and a localised time instead of `workspace-prepared` / the ISO string.
    await expect(canvas.getByText('Środowisko pracy przygotowane')).toBeVisible();
    await expect(canvas.queryByText('workspace-prepared')).toBeNull();
    await expect(canvas.queryByText(/2026-10-20T14:32:08Z/)).toBeNull();
    await expect(
      canvas.getByText('Nowe środowisko pracy', { selector: 'dd > span' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź stan operacji' }));
    await waitFor(() => expect(canvas.queryByText('Tworzenie wymaga dokończenia')).toBeNull());
    // The same operation id was checked; creation itself was sent exactly once.
    await expect(createRequests).toHaveLength(1);
  },
};

export const ProtectedTypedBranchIsFlaggedAtItsFieldAndNothingWasCreated: Story = {
  render: () => <Fixture createBehavior="branch-protected" optionsVariants={['commits']} />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: /Zmień ustawienia/ }));
    await userEvent.click(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }));
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
      'feature/payments-v2',
    );
    await userEvent.click(submit(canvas));
    await canvas.findByText('Gałąź jest chroniona');
    const input = canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' });
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText(/Nie utworzono specyfikacji/)).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
  },
};

export const ProtectedWorkspaceOffersARefreshAndKeepsTheForm: Story = {
  render: () => <Fixture createBehavior="branch-protected" optionsVariants={['commits']} />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(await canvas.findByRole('radio', { name: 'Bieżący katalog' }));
    await userEvent.click(submit(canvas));
    await canvas.findByText('Gałąź jest chroniona');
    await expect(canvas.getByText(/Gałąź wybranego środowiska pracy jest chroniona/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Odśwież opcje' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeEnabled();
  },
};

export const CommitBlockedExplainsWhatToDoAndKeepsTheForm: Story = {
  render: () => <Fixture createBehavior="commit-blocked" optionsVariants={['commits']} />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Git nie może teraz przyjąć commita');
    await expect(canvas.getByText(/Nie utworzono specyfikacji/)).toBeVisible();
    await expect(canvas.getByText(/trwa scalanie lub rebase/)).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeEnabled();
    await expect(submit(canvas)).toBeEnabled();
  },
};

export const CommitFailedIsRecoveryNotARetry: Story = {
  render: () => <Fixture createBehavior="commit-failed" optionsVariants={['commits']} />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText(
      'Pliki specyfikacji powstały, ale nie udało się zapisać ich w commicie',
    );
    await expect(canvas.getByText(/Nie twórz jej ponownie/)).toBeVisible();
    await expect(canvas.queryByText(/Nie utworzono specyfikacji/)).toBeNull();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeDisabled();
    await expect(canvas.queryByRole('button', { name: 'Utwórz specyfikację' })).toBeNull();
    await expect(canvas.getAllByRole('button', { name: /^Sprawdź (stan|wynik)/ })).toHaveLength(1);
    // Created once; the check reads the same operation.
    await expect(createRequests).toHaveLength(1);
  },
};

export const OperationConflictIssuesANewOperationId: Story = {
  render: () => <Fixture createBehavior="operation-conflict" />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Ta operacja została już użyta z innym żądaniem');
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(createRequests[1]!.operationId).not.toBe(createRequests[0]!.operationId);
  },
};

export const WorkspaceSectionGeometryInTheForm: Story = {
  render: () => <Fixture optionsVariants={['long-names']} />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: /Zmień ustawienia/ }));
    for (const width of [320, 390, 768, 1440, 2560]) await expectNoOverflow(width);
    const [a, b, c] = [
      'Nowe środowisko pracy',
      'Bieżący katalog',
      'Istniejące środowisko pracy',
    ].map((name) =>
      canvas.getByRole('radio', { name }).closest('label')!.getBoundingClientRect(),
    ) as [DOMRect, DOMRect, DOMRect];
    // Wide: three equal columns on one row.
    await expect(Math.abs(a.top - c.top)).toBeLessThan(1);
    await expect(Math.abs(a.width - b.width)).toBeLessThan(1);
    await settle(390);
    const stacked = canvas.getByRole('radio', { name: 'Bieżący katalog' }).closest('label')!;
    await expect(stacked.getBoundingClientRect().top).toBeGreaterThan(a.bottom - 1);
  },
};

/**
 * The Create action and its hint are pinned under the scrolling form: scrolling the form never moves
 * them, at 1440, at 900 and at 390 with the height left by an open on-screen keyboard.
 */
export const CreateActionStaysVisibleWhileTheFormScrolls: Story = {
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    for (const [width, height] of [
      [1440, 900],
      [900, 800],
      [390, 500],
    ] as const) {
      await settleViewport(width, height);
      const submit = canvas.getByRole('button', { name: 'Utwórz specyfikację' });
      const footer = canvas.getByRole('group', { name: 'Utworzenie specyfikacji' });
      const scroller = canvas
        .getByRole('textbox', { name: 'Nazwa specyfikacji' })
        .closest<HTMLElement>('.scroll-area-viewport')!;
      await expect(scroller.contains(footer)).toBe(false);
      await expect(footer.closest('form')).toBe(scroller.closest('form'));
      const before = submit.getBoundingClientRect();
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const after = submit.getBoundingClientRect();
      await expect(Math.abs(after.top - before.top)).toBeLessThan(1);
      await expect(after.bottom).toBeLessThanOrEqual(height + 1);
      await expect(footer.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        scroller.getBoundingClientRect().bottom - 1,
      );
      scroller.scrollTop = 0;
    }
    await settleViewport();
  },
};

/* Review fixes (REVIEW-UX F-01/F-02/F-12, REVIEW-QUALITY Q1-Q5). */
const setOnline = (online: boolean) => {
  if (online) Reflect.deleteProperty(navigator, 'onLine');
  else Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
};
const settings = (canvas: Canvas) => canvas.getByRole('button', { name: /Zmień ustawienia/ });

export const AutomaticBranchNameCollisionOffersACustomName: Story = {
  render: () => <Fixture createBehavior="branch-exists" />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    // F-01: never a silent no-op. A visible alert says what happened and what to do.
    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent('Nevo nie zdołało wybrać wolnej nazwy gałęzi');
    await expect(alert).toHaveTextContent('Specyfikacja nie została utworzona');
    await expect(alert).toBeVisible();
    await expect(lastRequest().target).toEqual({ kind: 'new-worktree' });
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
    await expect(canvas.queryByRole('button', { name: 'Użyj automatycznej nazwy' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Podaj własną nazwę' }));
    await expect(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' })).toBeChecked();
    await expect(settings(canvas)).toHaveAttribute('aria-expanded', 'true');
    const field = canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' });
    await waitFor(() => expect(field).toHaveFocus());
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
    await userEvent.clear(field);
    await userEvent.type(field, 'feature/payments-own');
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(lastRequest().target).toEqual({
      kind: 'new-worktree',
      branch: 'feature/payments-own',
    });
  },
};

export const OpeningSettingsDoesNotRetireAFailureAlert: Story = {
  render: () => <Fixture createBehavior="stale-workspace" />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Stan środowiska pracy zmienił się od otwarcia formularza');
    // Q4: opening / closing the disclosure is not an edit of the request.
    await userEvent.click(settings(canvas));
    await expect(settings(canvas)).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('alert')).toHaveTextContent('Stan środowiska pracy zmienił się');
    await userEvent.click(settings(canvas));
    await expect(canvas.getByRole('alert')).toHaveTextContent('Stan środowiska pracy zmienił się');
    // A real edit still retires it.
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }), ' v2');
    await waitFor(() => expect(canvas.queryByRole('alert')).toBeNull());
  },
};

export const UncertainReplayIgnoresACatalogueRevisionChange: Story = {
  render: () => <Fixture createBehavior="lost-ack" controls />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Sprawdzamy wynik tworzenia');
    await expect(canvas.getByLabelText('Odczyty')).toHaveTextContent('katalog:1');
    await userEvent.click(canvas.getByRole('button', { name: 'Zmień rewizję katalogu' }));
    await waitFor(() => expect(canvas.getByLabelText('Odczyty')).toHaveTextContent('katalog:2'));
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    // Q1: the stored attempt is replayed verbatim, revision included, under the same id.
    await expect(createRequests[1]).toEqual(createRequests[0]);
    await expect(createRequests[1]!.catalogueRevision).toBe(createRequests[0]!.catalogueRevision);
  },
};

export const UncertainReplayIgnoresAnOptionsRefetchThatFlipsTheDefaultTile: Story = {
  render: () => (
    <Fixture createBehavior="lost-ack" controls optionsVariants={['default', 'git-unavailable']} />
  ),
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeChecked();
    await userEvent.click(submit(canvas));
    await canvas.findByText('Sprawdzamy wynik tworzenia');
    await userEvent.click(canvas.getByRole('button', { name: 'Odśwież opcje w tle' }));
    await waitFor(() => expect(canvas.getByLabelText('Odczyty')).toHaveTextContent('opcje:2'));
    // The untouched tile followed the new default (new -> main); the replay must not.
    await waitFor(() =>
      expect(canvas.getByRole('radio', { name: 'Bieżący katalog' })).toBeChecked(),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(createRequests[1]).toEqual(createRequests[0]);
    await expect(createRequests[1]!.target).toEqual({ kind: 'new-worktree' });
  },
};

export const DiagnosticsDescribeTheSentOperation: Story = {
  render: () => (
    <Fixture
      createBehavior="recovery-required"
      controls
      optionsVariants={['default', 'git-unavailable']}
    />
  ),
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Tworzenie wymaga dokończenia');
    await userEvent.click(canvas.getByRole('button', { name: 'Odśwież opcje w tle' }));
    await waitFor(() => expect(canvas.getByLabelText('Odczyty')).toHaveTextContent('opcje:2'));
    await userEvent.click(canvas.getByRole('button', { name: 'Dane diagnostyczne' }));
    // Q2: the place comes from the sent request, not from the refetched options / current tile.
    await expect(
      canvas.getByText('Nowe środowisko pracy', { selector: 'dd > span' }),
    ).toBeVisible();
    await expect(canvas.queryByText('Bieżący katalog', { selector: 'dd > span' })).toBeNull();
  },
};

export const TileChangeAfterAFailureRetiresTheAlertAndIssuesANewOperation: Story = {
  render: () => <Fixture createBehavior="failed" />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Nie udało się utworzyć specyfikacji');
    const first = lastRequest().operationId;
    await userEvent.click(canvas.getByRole('radio', { name: 'Bieżący katalog' }));
    await waitFor(() => expect(canvas.queryByRole('alert')).toBeNull());
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(lastRequest().operationId).not.toBe(first);
    await expect(lastRequest()).not.toHaveProperty('target');
  },
};

export const SameBodyRetryAfterADefinitiveFailureKeepsTheOperationId: Story = {
  render: () => <Fixture createBehavior="failed" />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Nie udało się utworzyć specyfikacji');
    // Definitive error: the form is unlocked and nothing is pinned.
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeEnabled();
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(createRequests[1]!.operationId).toBe(createRequests[0]!.operationId);
  },
};

export const DoubleClickOnCreateSendsOneRequest: Story = {
  render: () => <Fixture createDelayMs={250} />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.dblClick(submit(canvas));
    // Both clicks are done: the answer of the one request in flight settles before asserting.
    await waitFor(() => expect(createAnswers.count).toBe(1));
    await expect(createRequests).toHaveLength(1);
  },
};

export const DoubleClickOnTheCheckSendsOneReplay: Story = {
  render: () => <Fixture createBehavior="lost-ack" createDelayMs={250} />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Sprawdzamy wynik tworzenia', {}, { timeout: 3000 });
    await userEvent.dblClick(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    // The original request and ONE replay have been answered; a second replay would be a third request.
    await waitFor(() => expect(createAnswers.count).toBe(2));
    await expect(createRequests).toHaveLength(2);
    await expect(createRequests[1]).toEqual(createRequests[0]);
  },
};

export const OfflineCreateIsNeverSentAndOffersAClearRetry: Story = {
  render: () => <Fixture />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    setOnline(false);
    try {
      await userEvent.click(submit(canvas));
      // F-02: not a hang on "Przygotowywanie…", not an uncertain outcome: nothing left the browser.
      const alert = await canvas.findByRole('alert');
      await expect(alert).toHaveTextContent('Brak połączenia');
      await expect(alert).toHaveTextContent('Nic nie zostało wysłane ani utworzone');
      await expect(canvas.queryByText('Sprawdzamy wynik tworzenia')).toBeNull();
      await expect(createRequests).toHaveLength(0);
      await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeEnabled();
      await expect(submit(canvas)).toBeEnabled();
    } finally {
      setOnline(true);
    }
    await userEvent.click(submit(canvas));
    await waitFor(() => expect(createRequests).toHaveLength(1));
  },
};

export const OfflineCheckKeepsTheUncertainOutcome: Story = {
  render: () => <Fixture createBehavior="lost-ack" />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Sprawdzamy wynik tworzenia');
    setOnline(false);
    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
      await canvas.findByText(/Brak połączenia — nie sprawdziliśmy wyniku/);
      // Still the uncertain panel and still locked: going offline proves nothing about the commit.
      await expect(canvas.getByText('Sprawdzamy wynik tworzenia')).toBeVisible();
      await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeDisabled();
      await expect(createRequests).toHaveLength(1);
    } finally {
      setOnline(true);
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(createRequests[1]).toEqual(createRequests[0]);
  },
};

export const TimeoutAfterDispatchIsUncertainNotARetry: Story = {
  render: () => <Fixture createBehavior="timeout" />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Sprawdzamy wynik tworzenia');
    await expect(canvas.queryByText('Brak połączenia')).toBeNull();
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(createRequests[1]!.operationId).toBe(createRequests[0]!.operationId);
  },
};

export const FailedRefreshDoesNotClaimSuccess: Story = {
  render: () => <Fixture optionsFailAfter={1} />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: 'Odśwież opcje środowiska pracy' }));
    // Q3: the refetch failed; the old options stay, but the user is told so, visibly.
    await canvas.findByText('Nie udało się odświeżyć opcji', { selector: 'div' });
    await expect(
      canvas.getByText(/^Nie udało się odświeżyć opcji/, { selector: '[role="status"]' }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText('Opcje odświeżone.')).toBeNull();
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeChecked();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
  },
};

export const CreateForbiddenLocksTheForm: Story = {
  render: () => <Fixture createBehavior="forbidden" />,
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent('Nie masz uprawnień do tworzenia specyfikacji');
    await expect(alert).toHaveTextContent('Formularz jest tylko do odczytu.');
    // Q5: the message is true: the form really is read-only.
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeDisabled();
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeDisabled();
    await expect(submit(canvas)).toBeDisabled();
  },
};

export const IntegrationTargetUnavailableKeepsTheFormAndOffersARefresh: Story = {
  render: () => <Fixture createBehavior="integration-target-unavailable" />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent(
      'Jedna z wybranych opcji nie jest już poprawna lub dostępna.',
    );
    await expect(alert).toHaveTextContent('Specyfikacja nie została utworzona');
    await expect(canvas.getByRole('button', { name: 'Odśwież opcje' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeEnabled();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
  },
};

export const BaseRefUnavailableKeepsTheFormAndOffersARefresh: Story = {
  render: () => <Fixture createBehavior="base-ref-unavailable" />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    const alert = await canvas.findByRole('alert');
    // The explanation is mapped from the error code; the server text is never shown.
    await expect(alert).toHaveTextContent('Wybrana gałąź początkowa nie jest już dostępna.');
    await expect(canvas.getByRole('button', { name: 'Odśwież opcje' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Nowa obsługa płatności',
    );
  },
};

export const CompletedStatusWithoutAResultIsReportedNotIgnored: Story = {
  render: () => <Fixture createBehavior="recovery-required" statusWithoutResult />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Tworzenie wymaga dokończenia');
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź stan operacji' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź stan operacji' }));
    // Q5b: a completed status without its result is not silently dropped.
    await canvas.findByText(/Nie udało się odczytać stanu operacji/);
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeDisabled();
    await expect(createRequests).toHaveLength(1);
  },
};

export const NotStartedStatusKeepsTheOperationUntilItIsKnownToBeFinished: Story = {
  render: () => <Fixture createBehavior="recovery-required" firstStatus="not-started" />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(submit(canvas));
    await canvas.findByText('Tworzenie wymaga dokończenia');
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź stan operacji' }));
    // `not-started` is not proof that the first request will never commit: the form stays locked.
    await canvas.findByRole('button', { name: 'Sprawdź wynik' });
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(createRequests).toHaveLength(2));
    await expect(createRequests[1]!.operationId).toBe(createRequests[0]!.operationId);
    await expect(createRequests[1]).toEqual(createRequests[0]);
  },
};

export const RefetchInvalidatingACollapsedSettingOpensThePanel: Story = {
  render: () => <Fixture controls optionsVariants={['default', 'platform-dirty']} />,
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openManualForm(canvas, userEvent);
    await userEvent.click(settings(canvas));
    await userEvent.click(
      canvas.getByRole('switch', { name: 'Scal później do innego środowiska' }),
    );
    await userEvent.click(canvas.getByRole('combobox', { name: 'Scal do' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /feature\/platform/ }),
    );
    await userEvent.click(settings(canvas));
    await expect(settings(canvas)).toHaveAttribute('aria-expanded', 'false');
    // A background refetch removes the chosen target: the panel opens on the flagged field.
    await userEvent.click(canvas.getByRole('button', { name: 'Odśwież opcje w tle' }));
    await waitFor(() => expect(settings(canvas)).toHaveAttribute('aria-expanded', 'true'));
    await expect(canvas.getByRole('combobox', { name: 'Scal do' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(canvas.getAllByText(/nie może już być celem scalenia/)[0]).toBeVisible();
    await expect(submit(canvas)).toBeDisabled();
  },
};
