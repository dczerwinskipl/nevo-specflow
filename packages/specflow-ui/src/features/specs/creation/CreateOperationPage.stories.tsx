import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import type {
  CreateOperationAccepted,
  CreateOperationInspection,
  CreatedSpec,
  CreateSpecRequest,
} from '@nevo/specflow-contracts/specs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';

import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { settleOwnerV4 } from '../../../test-support/ownerV4Capture.stories-support';
import { ApiError } from '../../../api';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { withLocale } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
import { createOperationEventsUrl } from './api.project';
import { CreateOperationScreen } from './CreateOperationScreen';
import { createSessionOperationStorage } from './createOperationStorage';
import type { CreateSettingsFacts } from './workspace/createFacts';
import { initialWorkspaceChoice } from './workspace/workspaceChoice';

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
};
const event = { ...base, at: '2026-10-20T14:32:08Z' };

type Server = 'running' | 'completed' | 'unknown' | 'failed-branch' | 'refuses-branch' | 'lost';
type Stream = 'steps' | 'unavailable';

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
  const events: readonly OperationProgressEvent[] = [
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
      return Promise.reject(apiError({ kind: 'not-found', outcome: 'not-applied', status: 404 }));
    case 'lost':
      return Promise.reject(apiError({ kind: 'network' }));
  }
}

interface FixtureProps {
  /** The request this browser stored when the form handed over; none is a direct link. */
  request?: CreateSpecRequest & { operationId?: string };
  /** What the form saved with the draft about this Create (workspace names, folder, merge target). */
  facts?: CreateSettingsFacts;
  server?: Server;
  stream?: Stream;
  onOpen?: (created: CreatedSpec) => void;
  onBackToForm?: () => void;
}

function Fixture({
  request,
  facts,
  server = 'running',
  stream = 'steps',
  onOpen = () => undefined,
  onBackToForm = () => undefined,
}: FixtureProps) {
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  // The page reads sessionStorage when it mounts, so it is prepared before the first render.
  useMemo(() => {
    sessionStorage.clear();
    const storage = createSessionOperationStorage('unknown', sessionStorage);
    if (request) storage.save({ request: { ...request, operationId }, startedAt: Date.now() });
    storage.saveDraft({
      operationId,
      title: request?.title ?? '',
      goal: request?.goal ?? '',
      choice: initialWorkspaceChoice,
      ...(facts ? { facts } : {}),
    });
  }, [request, facts]);
  const services = useMemo(
    () =>
      createSpecFlowAppServices({
        runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
        projectCreationApi: {
          createOptions: () => Promise.reject(new Error('not used by the page')),
          // The Runtime that has not seen the request: the page sends it, the answer follows `server`.
          create: () =>
            server === 'refuses-branch'
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
  within(within(canvasElement).getByRole('status', { name: 'Postęp tworzenia specyfikacji' }));

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
 * Right after Create: ONE heading says that the specification is being created and which one, the
 * settings of this creation follow in plain language, then the live steps; leaving is explained,
 * nothing alarms.
 */
export const InProgressWithSteps: Story = {
  args: { request: newWorkspace, facts: newWorkspaceFacts },
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole('heading', {
      level: 1,
      name: 'Tworzenie specyfikacji: Limity płatności',
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await expect(heading).toHaveAttribute('title', 'Limity płatności');
    // The name is not repeated below the heading.
    await expect(canvas.getAllByText(/Limity płatności/)).toHaveLength(1);
    const settings = settingsList(canvas);
    await expect(settings.getByText('W nowym środowisku pracy')).toBeInTheDocument();
    await expect(settings.getByText('feature/limity-platnosci')).toBeInTheDocument();
    await expect(settings.getByText('/work/acme-app-worktrees')).toBeInTheDocument();
    await expect(settings.getByText('Zacznij od')).toBeInTheDocument();
    await expect(settings.getByText('Scal do')).toBeInTheDocument();
    await expect(settings.getByText('acme-app')).toBeInTheDocument();
    const running = await canvas.findByText('Przygotowanie środowiska pracy');
    await waitFor(() => expect(running.closest('li')).toHaveAttribute('aria-current', 'step'));
    await expect(canvas.getByText('Rezerwowanie nazwy').closest('li')).toHaveTextContent(/gotowe$/);
    await expect(canvas.getByText(/Możesz opuścić tę stronę/)).toBeInTheDocument();
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
      name: 'Tworzenie specyfikacji: Limity płatności',
    });
    const settings = settingsList(canvas);
    await expect(settings.getByText(/Dodana do środowiska pracy/)).toBeInTheDocument();
    await expect(settings.getByText('platform')).toBeInTheDocument();
    await expect(settings.getByText('feature/platform')).toBeInTheDocument();
    await expect(settings.queryByText('Katalog worktree')).not.toBeInTheDocument();
    await expect(settings.queryByText('Scal do')).not.toBeInTheDocument();
  },
};

/**
 * The merge target has uncommitted changes: creating is not affected, so the row carries one quiet
 * sentence with what to do before merging into it later; no alert.
 */
export const MergeTargetHasUncommittedChanges: Story = {
  args: {
    request: { ...newWorkspace, slug: 'limity', goal: 'Ograniczyć limity płatności cyklicznych.' },
    facts: { ...newWorkspaceFacts, mergeReason: 'dirty', slug: 'limity' },
  },
  play: async ({ canvas }) => {
    await canvas.findByLabelText('Ustawienia tworzenia');
    const settings = settingsList(canvas);
    await expect(
      settings.getByText(
        'To środowisko pracy ma niezapisane zmiany. Specyfikację nadal możesz utworzyć; zatwierdź je (commit) lub odłóż (stash) przed scaleniem do niego.',
      ),
    ).toBeVisible();
    await expect(settings.getByText('limity')).toBeInTheDocument();
    await expect(
      settings.getByText('Ograniczyć limity płatności cyklicznych.'),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

/**
 * A long name, a long branch and no spaces to break at: the single heading wraps inside 320 px
 * (clamped to three lines, the full name stays in its tooltip), nothing scrolls sideways.
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
    await settleOwnerV4('creation-progress-320', 320, 740);
    await canvas.findByText('Przygotowanie środowiska pracy');
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
    const heading = canvas.getByRole('heading', { level: 1, name: /^Tworzenie specyfikacji: Ogr/ });
    await expect(heading.getBoundingClientRect().right).toBeLessThanOrEqual(320);
    await expect(heading).toHaveAttribute('title', expect.stringMatching(/dostawcami rozliczeń$/));
    for (const row of steps(canvasElement).getAllByRole('listitem'))
      await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(320);
  },
};

/** No live stream (older Runtime, proxy without SSE): a calm note, no error, the operation goes on. */
export const NoLiveSteps: Story = {
  args: { request: newWorkspace, stream: 'unavailable' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Nadal pracujemy')).toBeInTheDocument();
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
      await expect(row).toHaveTextContent(/gotowe$/);
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
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do formularza' }));
    await expect(args.onBackToForm).toHaveBeenCalledOnce();
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
    await canvas.findByText('Przygotowanie środowiska pracy');
    // Nothing is known about this Create: no name in the heading and no settings are guessed.
    await expect(canvas.queryByText(/Limity płatności/)).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText('Ustawienia tworzenia')).not.toBeInTheDocument();
  },
};
