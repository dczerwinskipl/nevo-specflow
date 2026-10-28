import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import type {
  CreateOperationAccepted,
  CreateOperationInspection,
  CreatedSpec,
} from '@nevo/specflow-contracts/specs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';

import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { ApiError } from '../../../../api';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../../services';
import type { OperationsApi } from '../../../../shared/operations/operationsApi';
import { createOperationEventsUrl } from '../api/api.project';
import { CreateOperationScreen } from '../CreateOperationScreen';
import { createSessionOperationStorage } from '../operation/createOperationStorage';
import type { ProjectCreateRequest } from '../api/api.project';
import type { CreateSettingsFacts } from '../workspace/model/createFacts';
import { initialWorkspaceChoice } from '../workspace/model/workspaceChoice';
import { archetypeSelectionFixture } from '../workspace/model/createRequest.test-support';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const base = { operationId, kind: 'specification-create' as const };
const accepted: CreateOperationAccepted = { ...base, status: 'in-progress' };
const createdSpec: CreatedSpec = {
  ...base,
  specId: '00000000-0000-4000-8000-0000000000aa',
  status: 'completed',
  slug: 'limity-platnosci',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  relativeManifestPath: 'specs/active/limity-platnosci/specification.yaml',
  documentIds: ['overview'],
};
const event = { ...base, at: '2026-10-20T14:32:08Z' };

type Server =
  | 'running'
  | 'completed'
  | 'unknown'
  | 'failed-branch'
  | 'refuses-branch'
  | 'lost'
  | 'refuses-protected'
  | 'refuses-blocked'
  | 'refuses-path'
  | 'commit-failed';
type Stream = 'steps' | 'unavailable' | 'commit-steps' | 'commit-steps-existing';

const apiError = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({
    kind: 'server',
    operation: 'specs.create',
    outcome: 'unknown',
    retryable: false,
    ...init,
  });

/** Plays the Runtime's stream with short delays; the run keeps going so the steps stay visible. */
function operationsFor(behavior: Stream): OperationsApi {
  // Git enabled: the Runtime lists `committing-specification` (and an existing workspace has no
  // workspace step).
  const committing = behavior === 'commit-steps' || behavior === 'commit-steps-existing';
  const existing = behavior === 'commit-steps-existing';
  const events: readonly OperationProgressEvent[] = committing
    ? [
        {
          ...event,
          type: 'snapshot',
          status: 'running',
          steps: [
            { id: 'reserving', status: 'running' },
            ...(existing ? [] : [{ id: 'preparing-workspace', status: 'pending' as const }]),
            { id: 'writing-specification', status: 'pending' },
            { id: 'committing-specification', status: 'pending' },
            { id: 'registering', status: 'pending' },
          ],
        },
        { ...event, type: 'step', step: 'reserving', status: 'done' },
        ...(existing
          ? []
          : [
              {
                ...event,
                type: 'step' as const,
                step: 'preparing-workspace',
                status: 'done' as const,
              },
            ]),
        { ...event, type: 'step', step: 'writing-specification', status: 'done' },
        { ...event, type: 'step', step: 'committing-specification', status: 'running' },
      ]
    : [
        {
          ...event,
          type: 'snapshot',
          status: 'running',
          steps: [
            { id: 'reserving', status: 'running' },
            { id: 'preparing-workspace', status: 'pending' },
            { id: 'writing-specification', status: 'pending' },
            { id: 'registering', status: 'pending' },
          ],
        },
        { ...event, type: 'step', step: 'reserving', status: 'done' },
        { ...event, type: 'step', step: 'preparing-workspace', status: 'running' },
      ];
  return {
    list: () => Promise.resolve({ kind: 'unavailable' as const }),
    async *watchProgress(_streamUrl, signal) {
      if (behavior === 'unavailable') throw new Error('Stream unavailable');
      for (const next of events) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (signal?.aborted) return;
        yield next;
      }
      await new Promise<void>((resolve) =>
        signal?.addEventListener('abort', () => resolve(), { once: true }),
      );
    },
  };
}

/** What the server answers for the operation: the story picks the situation, not the wiring. */
function inspect(server: Server): Promise<CreateOperationInspection> {
  switch (server) {
    case 'running':
      return Promise.resolve(accepted);
    case 'completed':
      return Promise.resolve(createdSpec);
    case 'failed-branch':
      return Promise.resolve({ ...accepted, status: 'failed', code: 'BRANCH_ALREADY_EXISTS' });
    case 'unknown':
    case 'refuses-branch':
    case 'refuses-protected':
    case 'refuses-blocked':
    case 'refuses-path':
    case 'commit-failed':
      return Promise.reject(apiError({ kind: 'not-found', outcome: 'not-applied', status: 404 }));
    case 'lost':
      return Promise.reject(apiError({ kind: 'network' }));
  }
}

interface FixtureProps {
  /** The request this browser stored when the form handed over; none is a direct link. */
  request?: Omit<ProjectCreateRequest, keyof typeof archetypeSelectionFixture> & {
    operationId?: string;
  };
  /** What the form saved with the draft about this Create (workspace names, folder, merge target). */
  facts?: CreateSettingsFacts;
  server?: Server;
  stream?: Stream;
  onOpen?: (created: CreatedSpec) => void;
  onBackToForm?: () => void;
  onBackToSpecifications?: () => void;
}

function Fixture({
  request,
  facts,
  server = 'running',
  stream = 'steps',
  onOpen = () => undefined,
  onBackToForm = () => undefined,
  onBackToSpecifications = () => undefined,
}: FixtureProps) {
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  // The page reads sessionStorage when it mounts, so it is prepared before the first render.
  useMemo(() => {
    sessionStorage.clear();
    const storage = createSessionOperationStorage('unknown', sessionStorage);
    if (request)
      storage.save({
        request: { ...archetypeSelectionFixture, ...request, operationId },
        startedAt: Date.now(),
      });
    storage.saveDraft({
      operationId,
      title: request?.title ?? '',
      goal: request?.goal ?? '',
      choice: initialWorkspaceChoice,
      // What the form showed about the archetype: the page lists it with the files it makes.
      archetypeTitle: 'Feature',
      documentFiles: ['overview.md', 'behaviour.md', 'ux.md'],
      ...(facts ? { facts } : {}),
    });
  }, [request, facts]);
  const services = useMemo(
    () =>
      createSpecFlowAppServices({
        runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
        projectCreationApi: {
          createOptions: () => Promise.reject(new Error('not used by the page')),
          archetypes: () => Promise.reject(new Error('not used by the page')),
          // The Runtime that has not seen the request: the page sends it, the answer follows `server`.
          create: () =>
            server === 'refuses-protected'
              ? Promise.reject(
                  apiError({
                    kind: 'precondition',
                    outcome: 'not-applied',
                    status: 422,
                    code: 'BRANCH_PROTECTED',
                  }),
                )
              : server === 'refuses-path'
                ? Promise.reject(
                    apiError({
                      kind: 'validation',
                      outcome: 'not-applied',
                      status: 400,
                      code: 'DOCUMENT_PATH_INVALID',
                    }),
                  )
                : server === 'refuses-blocked'
                  ? Promise.reject(
                      apiError({
                        kind: 'conflict',
                        outcome: 'not-applied',
                        status: 409,
                        code: 'COMMIT_BLOCKED',
                      }),
                    )
                  : server === 'commit-failed'
                    ? Promise.reject(
                        apiError({
                          kind: 'recovery-required',
                          outcome: 'unknown',
                          status: 503,
                          code: 'COMMIT_FAILED',
                        }),
                      )
                    : server === 'refuses-branch'
                      ? Promise.reject(
                          apiError({
                            kind: 'conflict',
                            outcome: 'not-applied',
                            status: 409,
                            code: 'BRANCH_ALREADY_EXISTS',
                          }),
                        )
                      : server === 'unknown'
                        ? Promise.reject(apiError({ kind: 'network' }))
                        : Promise.resolve(accepted),
          inspectOperation: () => inspect(server),
          operationEventsUrl: createOperationEventsUrl,
        },
        operationsApi: operationsFor(stream),
      }),
    [server, stream],
  );
  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div style={{ width: '100%', height: '100vh' }}>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Projekt</div>} style={{ height: '100%', width: '100%' }}>
                <CreateOperationScreen
                  operationId={operationId}
                  onOpen={onOpen}
                  onBackToForm={onBackToForm}
                  onBackToSpecifications={onBackToSpecifications}
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
  title: 'SpecFlow/Features/Specification Creation/Progress Page',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  beforeEach: () => sessionStorage.clear(),
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The checklist only: the breadcrumbs are list items too. */
const steps = (canvasElement: HTMLElement) =>
  within(within(canvasElement).getByRole('group', { name: 'Postęp tworzenia specyfikacji' }));

/** The page subtitle, not the screen-reader announcer that repeats it (`sr-only`). */
const visibleText = { selector: 'p:not(.sr-only)' } as const;

const newWorkspace = { title: 'Limity płatności', target: { kind: 'new-worktree' as const } };

/** What the form saved for a new workspace: where it goes, the branch, the folder and the merge target. */
const newWorkspaceFacts: CreateSettingsFacts = {
  place: 'new',
  base: 'develop',
  branch: 'feature/limity-platnosci',
  folder: '/work/acme-app-worktrees',
  mergeInto: { name: 'acme-app', branch: 'develop' },
};

/** The heading names the state and the specification in one line; the settings follow in plain facts. */
const settingsList = (canvas: { getByLabelText: (label: string) => HTMLElement }) =>
  within(canvas.getByLabelText('Ustawienia tworzenia'));

/**
 * Right after Create: the progress is the primary content. A static status icon (the running step carries the only spinner),
 * ONE heading that names the specification, a subtitle that says what is happening, the steps in
 * plain language (what is done, what runs, what waits), then the compact configuration, closed
 * technical details, a quiet note about leaving and the way back to the list.
 */
export const InProgressWithSteps: Story = {
  args: { request: newWorkspace, facts: newWorkspaceFacts },
  play: async ({ canvas, canvasElement }) => {
    const heading = await canvas.findByRole('heading', {
      level: 1,
      name: 'Tworzenie: Limity płatności',
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    // No tooltip: the full name is the first row of the configuration list.
    await expect(heading).not.toHaveAttribute('title');
    // The generic subtitle ("Przygotowujemy…") is only shown until the running step arrives; the
    // step then names itself, so asserting the generic line would depend on timing. The stable
    // state is asserted below (running step, its description, finished step).
    await expect(settingsList(canvas).getByText('Limity płatności')).toBeInTheDocument();
    const running = await steps(canvasElement).findByText('Przygotowanie środowiska pracy');
    await waitFor(() => expect(running.closest('li')).toHaveAttribute('aria-current', 'step'));
    await expect(canvas.getByText('Tworzymy środowisko pracy')).toBeVisible();
    await expect(canvas.getByText('Rezerwowanie nazwy').closest('li')).toHaveTextContent(/gotowe/);
    await expect(canvas.getByText('Nazwa i gałąź zarezerwowane')).toBeVisible();
    // Pending steps are muted titles only: no repeated "waiting" line.
    await expect(canvas.queryByText('Czeka na poprzedni krok')).not.toBeInTheDocument();
    // The configuration is a compact secondary summary below the steps.
    await expect(canvas.getByRole('heading', { level: 2, name: 'Konfiguracja' })).toBeVisible();
    const settings = settingsList(canvas);
    await expect(settings.getByText('W nowym środowisku pracy')).toBeInTheDocument();
    await expect(settings.getByText('feature/limity-platnosci')).toBeInTheDocument();
    await expect(settings.getByText('Zacznij od')).toBeInTheDocument();
    await expect(settings.getByText('Scal do')).toBeInTheDocument();
    // Technical values are behind a closed disclosure, not in the summary.
    await expect(settings.queryByText('/work/acme-app-worktrees')).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Szczegóły techniczne' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(canvas.getByText(/Możesz opuścić tę stronę/)).toBeInTheDocument();
    await expect(
      canvas.queryByText(/Otwórz Nowa specyfikacja|Wróć do niego przez/),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Wróć do specyfikacji' })).toBeEnabled();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

/**
 * Added to a workspace that already exists: the page names it with its branch and does not invent
 * a folder, a base or a merge target the owner never chose here.
 */
export const InProgressExistingWorkspace: Story = {
  args: {
    request: {
      title: 'Limity płatności',
      target: { kind: 'existing', workspaceId: '00000000-0000-4000-8000-0000000000bb' },
    },
    facts: { place: 'existing', workspace: { name: 'platform', branch: 'feature/platform' } },
  },
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      level: 1,
      name: 'Tworzenie: Limity płatności',
    });
    const settings = settingsList(canvas);
    await expect(settings.getByText(/Dodana do środowiska pracy/)).toBeInTheDocument();
    await expect(settings.getByText('platform')).toBeInTheDocument();
    await expect(settings.getByText('feature/platform')).toBeInTheDocument();
    await expect(settings.queryByText('Katalog worktree')).not.toBeInTheDocument();
    await expect(settings.queryByText('Scal do')).not.toBeInTheDocument();
    await expect(canvas.getByText('Przygotowujemy specyfikację.', visibleText)).toBeVisible();
  },
};

/**
 * The merge target has uncommitted changes: that caveat stays in the form next to the choice; the
 * progress page does not repeat it. The folder and the slug are in the technical details.
 */
export const MergeTargetWarningStaysInTheForm: Story = {
  args: {
    request: { ...newWorkspace, slug: 'limity', goal: 'Ograniczyć limity płatności cyklicznych.' },
    facts: { ...newWorkspaceFacts, mergeReason: 'dirty', slug: 'limity' },
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText('Ustawienia tworzenia');
    await expect(canvas.queryByText(/niezapisane zmiany/)).not.toBeInTheDocument();
    const settings = settingsList(canvas);
    await expect(
      settings.getByText('Ograniczyć limity płatności cyklicznych.'),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Szczegóły techniczne' }));
    await expect(await canvas.findByText('/work/acme-app-worktrees')).toBeVisible();
    await expect(canvas.getByText('limity')).toBeVisible();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

/**
 * A long name, a long branch and no spaces to break at: the single heading wraps inside 320 px
 * (clamped to three lines, the full name is a row of the configuration list), nothing scrolls sideways.
 */
export const LongTitleAt320: Story = {
  args: {
    request: {
      title:
        'Ograniczenia płatności cyklicznych dla klientów korporacyjnych w kanałach zdalnych oraz integracji z zewnętrznymi dostawcami rozliczeń',
      target: {
        kind: 'new-worktree',
        branch:
          'feature/ograniczenia-platnosci-cyklicznych-dla-klientow-korporacyjnych-w-kanalach-zdalnych',
      },
    },
    facts: {
      ...newWorkspaceFacts,
      branch:
        'feature/ograniczenia-platnosci-cyklicznych-dla-klientow-korporacyjnych-w-kanalach-zdalnych',
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await settleViewport(320, 740);
    // The same text is also announced in the sr-only live region once an effect has run, so the
    // query names the visible subtitle explicitly instead of relying on how early it is made.
    await canvas.findByText('Przygotowanie środowiska pracy', visibleText);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
    const heading = canvas.getByRole('heading', { level: 1, name: /^Tworzenie: Ogr/ });
    await expect(heading.getBoundingClientRect().right).toBeLessThanOrEqual(320);
    // No tooltip: the full name is a row of the configuration list.
    await expect(heading).not.toHaveAttribute('title');
    await expect(
      within(canvas.getByLabelText('Ustawienia tworzenia')).getByText(/dostawcami rozliczeń$/),
    ).toBeInTheDocument();
    for (const row of steps(canvasElement).getAllByRole('listitem'))
      await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(320);
  },
};

/** No live stream (older Runtime, proxy without SSE): one neutral "Creating specification" row, no error, nothing simulated. */
export const NoLiveSteps: Story = {
  args: { request: newWorkspace, stream: 'unavailable' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Kroki na żywo są niedostępne/)).toBeInTheDocument();
    // ONE neutral state; no steps are simulated.
    await expect(canvas.queryAllByRole('listitem')).toHaveLength(0);
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

/** Done: every step is checked, the page says so and the specification opens by itself (or on the button). */
export const Success: Story = {
  args: { request: newWorkspace, facts: newWorkspaceFacts, server: 'completed', onOpen: fn() },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: 'Specyfikacja utworzona: Limity płatności',
      }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Otwórz specyfikację' })).toBeInTheDocument();
    for (const row of steps(canvasElement).getAllByRole('listitem'))
      await expect(row).toHaveTextContent(/gotowe/);
    await waitFor(() => expect(args.onOpen).toHaveBeenCalledWith(createdSpec), { timeout: 4000 });
  },
};

/** The server refused the request before doing anything: what happened, and the way back with the values kept. */
export const Refused: Story = {
  args: {
    request: { ...newWorkspace, target: { kind: 'new-worktree', branch: 'feature/limity' } },
    server: 'refuses-branch',
    onBackToForm: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: 'Nie utworzono specyfikacji: Limity płatności',
      }),
    ).toBeInTheDocument();
    await expect(await canvas.findByRole('alert')).toBeInTheDocument();
    // What was NOT created, and the safe repair action.
    await expect(canvas.getByText(/^Nic nie zostało utworzone./, visibleText)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Wróć do specyfikacji' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do formularza' }));
    await expect(args.onBackToForm).toHaveBeenCalledOnce();
  },
};

/**
 * The progress page and the form share one content width (`content-standard`, 1100 px, centred by
 * the bounded workspace): the layout does not jump on submit, running or refused alike. Narrower
 * screens fill the workspace with the normal gutters.
 */
async function expectFormWidth() {
  const standard =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--spacing-content-standard'),
    ) * parseFloat(getComputedStyle(document.documentElement).fontSize);
  const heading = await within(document.body).findByRole('heading', { level: 1 });
  const content = heading.closest('.scroll-area')!.parentElement!;
  const surface =
    content.closest<HTMLElement>('[data-workspace-surface]') ?? content.parentElement!;
  for (const width of [1440, 1920, 2560, 900, 390]) {
    await settleViewport(width, 900);
    const box = content.getBoundingClientRect();
    if (width >= 1440) await expect(Math.abs(box.width - standard)).toBeLessThan(1);
    else await expect(Math.abs(box.width - surface.getBoundingClientRect().width)).toBeLessThan(2);
  }
  await settleViewport();
}
export const SharesTheFormWidth: Story = {
  args: { request: newWorkspace, facts: newWorkspaceFacts },
  play: () => expectFormWidth(),
};
export const RefusedSharesTheFormWidth: Story = {
  args: Refused.args,
  play: async ({ canvas }) => {
    await canvas.findByRole('alert');
    await expectFormWidth();
  },
};

/** The answer was lost: the outcome is not assumed, only the same operation can be checked. */
export const UnknownOutcome: Story = {
  args: { request: newWorkspace, server: 'unknown' },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: 'Wynik jeszcze niepotwierdzony: Limity płatności',
      }),
    ).toBeInTheDocument();
    await expect(await canvas.findByRole('button', { name: 'Sprawdź wynik' })).toBeEnabled();
    await expect(canvas.queryByRole('button', { name: 'Wróć do formularza' })).toBeNull();
  },
};

/** A link to an operation the server does not know: calm, nothing is created, a way back to Create. */
export const OperationNotFound: Story = {
  args: { server: 'unknown' },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', { level: 1, name: 'Nie znaleziono operacji' }),
    ).toBeInTheDocument();
    await expect(canvas.getByText('Ta operacja nie istnieje')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Wróć do tworzenia' })).toBeInTheDocument();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

/** A direct link to a running operation (storage cleared): the page shows what the server knows. */
export const DirectLinkInProgress: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', { level: 1, name: 'Tworzenie specyfikacji' }),
    ).toBeInTheDocument();
    await canvas.findAllByText('Przygotowanie środowiska pracy');
    // Nothing is known about this Create: no name in the heading and no settings are guessed.
    await expect(canvas.queryByText(/Limity płatności/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText('Ustawienia tworzenia')).not.toBeInTheDocument();
  },
};

/**
 * Git enabled: the checklist has its own step "Zapisywanie specyfikacji w commicie" between writing the
 * files and registering, and the configuration says on which branch the files are committed.
 */
export const InProgressWithTheCommitStep: Story = {
  args: {
    request: newWorkspace,
    facts: { ...newWorkspaceFacts, commit: true },
    stream: 'commit-steps',
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const running = (await canvas.findAllByText('Zapisywanie specyfikacji w commicie')).find(
      (node) => node.closest('li'),
    )!;
    await waitFor(() => expect(running.closest('li')).toHaveAttribute('aria-current', 'step'));
    await expect(canvas.getByText('Zapisujemy pliki specyfikacji w commicie')).toBeVisible();
    await expect(steps(canvasElement).getAllByRole('listitem')).toHaveLength(5);
    await expect(canvas.getByText('Pliki specyfikacji zapisane')).toBeVisible();
    // The commit is system behaviour, not a choice: it lives in the technical details.
    await expect(settingsList(canvas).queryByText('Commit')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Szczegóły techniczne' }));
    await expect(canvas.getByText('Commit')).toBeVisible();
  },
};

export const InProgressWithTheCommitStepInAnExistingWorkspace: Story = {
  args: {
    request: {
      title: 'Limity płatności',
      target: { kind: 'existing', workspaceId: '00000000-0000-4000-8000-0000000000bb' },
    },
    facts: {
      place: 'existing',
      workspace: { name: 'platform', branch: 'feature/platform' },
      commit: true,
    },
    stream: 'commit-steps-existing',
  },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findAllByText('Zapisywanie specyfikacji w commicie');
    // No workspace step for an existing workspace: four rows.
    await expect(steps(canvasElement).getAllByRole('listitem')).toHaveLength(4);
    await expect(
      settingsList(canvas).getAllByText('feature/platform').length,
    ).toBeGreaterThanOrEqual(1);
  },
};

/** A protected branch: nothing was created, the page says so and the form keeps the values. */
export const RefusedBecauseTheBranchIsProtected: Story = {
  args: {
    request: {
      title: 'Limity płatności',
      target: { kind: 'existing', workspaceId: '00000000-0000-4000-8000-0000000000bb' },
    },
    facts: { place: 'existing', workspace: { name: 'platform', branch: 'main' }, commit: true },
    server: 'refuses-protected',
    onBackToForm: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await canvas.findByRole('heading', {
      level: 1,
      name: 'Nie utworzono specyfikacji: Limity płatności',
    });
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Gałąź jest chroniona');
    await expect(canvas.getByText(/^Nic nie zostało utworzone./, visibleText)).toBeVisible();
    await expect(canvas.getByText(/Gałąź wybranego środowiska pracy jest chroniona/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Odśwież opcje' }));
    await expect(args.onBackToForm).toHaveBeenCalledOnce();
  },
};

/**
 * A long name makes a path the Engine refuses (`DOCUMENT_PATH_INVALID`): the name is the problem,
 * so the page says to shorten it and offers the form, never Refresh options.
 */
export const RefusedBecauseTheNameMakesAnInvalidPath: Story = {
  args: {
    request: {
      ...newWorkspace,
      title: 'Przegląd projektu z bardzo długą nazwą specyfikacji do sprawdzenia zawijania',
    },
    facts: newWorkspaceFacts,
    server: 'refuses-path',
    onBackToForm: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Nazwa daje specyfikacji nieprawidłową lub zbyt długą ścieżkę',
    );
    await expect(canvas.getByText(/Skróć nazwę lub użyj prostszych znaków/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Odśwież opcje' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do formularza' }));
    await expect(args.onBackToForm).toHaveBeenCalledOnce();
  },
};

/** Git is busy in the checkout: nothing was created; finish the merge or rebase and try again. */
export const RefusedBecauseGitCannotCommitNow: Story = {
  args: {
    request: newWorkspace,
    facts: { ...newWorkspaceFacts, commit: true },
    server: 'refuses-blocked',
  },
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      level: 1,
      name: 'Nie utworzono specyfikacji: Limity płatności',
    });
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Git nie może teraz przyjąć commita',
    );
    await expect(canvas.getByText(/^Nic nie zostało utworzone./, visibleText)).toBeVisible();
    await expect(canvas.getByText(/trwa scalanie lub rebase/)).toBeVisible();
  },
};

/**
 * The files were written but the commit failed: calm recovery, the truth that the files exist, no
 * "nothing was created" line and no way to create again, only a check of the same operation.
 */
export const CreatedButNotCommitted: Story = {
  args: {
    request: newWorkspace,
    facts: { ...newWorkspaceFacts, commit: true },
    server: 'commit-failed',
  },
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      level: 1,
      name: 'Wynik jeszcze niepotwierdzony: Limity płatności',
    });
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Pliki specyfikacji powstały, ale nie udało się zapisać ich w commicie',
    );
    await expect(
      canvas.getByText(
        'Pliki specyfikacji powstały, ale nie udało się zapisać ich w commicie.',
        visibleText,
      ),
    ).toBeVisible();
    await expect(canvas.queryByText(/Nic nie zostało utworzone/)).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Sprawdź stan operacji' })).toBeEnabled();
    await expect(canvas.queryByRole('button', { name: 'Wróć do formularza' })).toBeNull();
  },
};
