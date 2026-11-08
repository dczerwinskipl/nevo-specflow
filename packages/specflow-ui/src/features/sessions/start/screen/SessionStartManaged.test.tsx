// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  CreateSession as CreateSessionInput,
  ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import type { ManagedSessionsApi } from '../../managed/api';
import type { SessionAssociationsApi } from '../../associations/api';
import { sessionAssociationKeys } from '../../associations/queries';
import { forgetStartedSessions, startedSessionOf } from '../handoff/startedSession';
import { useManagedStartSource } from '../source/useManagedStartSource';
import { SessionStartScreen } from './SessionStartScreen';

/** A Specification's New Session in a project Runtime: the managed start source, Specification pinned. */
const pinned = {
  specId: 'spec',
  fact: { status: 'ready', value: { id: 'spec', key: 'SPEC-1', title: 'Login' } },
} as const;

const open = vi.fn<(sessionId: string) => void>();
beforeEach(() => {
  // The Radix Select the model and effort fields use measures and scrolls its options.
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* jsdom has no layout observer. */
      }
      unobserve() {
        /* jsdom has no layout observer. */
      }
      disconnect() {
        /* jsdom has no layout observer. */
      }
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
    onchange: null,
  }));
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  open.mockClear();
  forgetStartedSessions();
  vi.unstubAllGlobals();
});

function fixture() {
  const provider: ProviderDescriptor = {
    providerId: 'claude',
    title: 'Claude',
    readiness: 'ready',
    models: [],
    modes: ['read-only'],
    capabilities: {
      questions: true,
      permissions: false,
      resume: true,
      cancel: true,
      modelOverride: true,
      effortOverride: true,
    },
  };
  const providers = vi
    .fn<ManagedSessionsApi['providers']>()
    .mockResolvedValue({ items: [provider] });
  const create = vi
    .fn<(input: CreateSessionInput) => Promise<{ sessionId: string }>>()
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockResolvedValue({ sessionId: 'created' });

  return { providers, create, api: { providers, create } };
}

type TestApi = ReturnType<typeof fixture>['api'];

function ManagedSpecificationStart({ owner, api }: { owner: string; api: TestApi }) {
  const associations = {
    createInSpecification: async (specId: string, input: CreateSessionInput) => ({
      ...(await api.create(input)),
      association: { specId, taskIds: [] },
    }),
  } as unknown as SessionAssociationsApi;
  const source = useManagedStartSource(
    owner,
    { providers: api.providers } as unknown as ManagedSessionsApi,
    associations,
    pinned,
  );

  return <SessionStartScreen source={source} onOpenSession={open} />;
}

const writer = {
  modeId: 'agent',
  nativeMode: 'agent',
  title: 'Agent',
  mode: 'workspace-write' as const,
  readiness: 'ready' as const,
  authorized: true,
};
const plan = {
  modeId: 'plan',
  nativeMode: 'plan',
  title: 'Plan',
  mode: 'read-only' as const,
  readiness: 'ready' as const,
  authorized: true,
};

let client: QueryClient;
function view(api: TestApi, owner = 'alice') {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <StrictMode>
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <QueryClientProvider client={client}>
          <AppShell navigation={<div>Navigation</div>}>
            <AppWorkspaceProvider>
              <ManagedSpecificationStart key={owner} owner={owner} api={api} />
            </AppWorkspaceProvider>
          </AppShell>
        </QueryClientProvider>
      </LocalizationProvider>
    </StrictMode>,
  );
}

async function startButton() {
  const button = await screen.findByRole('button', { name: 'Start session' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));

  return button;
}

const clickStart = async () => fireEvent.click(await startButton());

it('shows the shell at once and the catalogue as a skeleton until it is read', async () => {
  const f = fixture();
  f.providers.mockImplementation(() => new Promise(() => undefined));
  view(f.api);
  expect(await screen.findByRole('heading', { level: 1, name: 'New session' })).toBeDefined();
  expect(screen.getByRole('heading', { level: 2, name: 'Start a session' })).toBeDefined();
  expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
});

it('explains external login and only refreshes discovery after the operator signs in', async () => {
  const f = fixture();
  const provider = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({ items: [{ ...provider, readiness: 'authenticationRequired' }] });
  view(f.api);
  await screen.findByText('Sign-in required');
  expect(screen.getByText(/Sign in again using the provider CLI/)).toBeDefined();
  expect(screen.getByText('No executor is available right now.')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Start session' }).hasAttribute('disabled')).toBe(true);
  f.providers.mockResolvedValue({ items: [provider] });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start session' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  expect(f.create).not.toHaveBeenCalled();
});

it('starts a provider without models at its defaults: Model is disabled, the work mode is decided', async () => {
  const f = fixture();
  view(f.api);
  await clickStart();
  const model = screen.getByRole('combobox', { name: 'Model' });
  expect(model.hasAttribute('disabled')).toBe(true);
  expect(model.textContent).toContain('Executor default');
  await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  expect(f.create.mock.calls[0]?.[0]).toMatchObject({ providerId: 'claude', mode: 'read-only' });
  expect(f.create.mock.calls[0]?.[0]).not.toHaveProperty('modelId');
  expect(f.create.mock.calls[0]?.[0]).not.toHaveProperty('effort');
});

it('defaults to the provider native writable mode and retains it on a lost response', async () => {
  const f = fixture();
  const base = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({
    items: [
      {
        ...base,
        modes: ['read-only', 'workspace-write'],
        defaultModeId: 'agent',
        providerModes: [writer, plan],
      },
    ],
  });
  view(f.api);
  expect((await screen.findByRole('radio', { name: 'Agent' })).getAttribute('aria-checked')).toBe(
    'true',
  );
  await clickStart();
  await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  expect(f.create.mock.calls[0]?.[0]).toMatchObject({
    mode: 'workspace-write',
    providerModeId: 'agent',
  });
  // The lost response leaves the request retained: it is resent as it was, never rebuilt.
  await screen.findByRole('button', { name: 'Retry creation' });
  expect(screen.getByText('The session could not be started')).toBeDefined();
  expect(open).not.toHaveBeenCalled();
});

it('retries a retained create after remount even when the provider becomes unavailable', async () => {
  const { api, create, providers } = fixture();
  const first = view(api);
  await clickStart();
  await screen.findByRole('button', { name: 'Retry creation' });
  const input = create.mock.calls[0]![0];
  first.unmount();
  providers.mockResolvedValue({ items: [] });
  view(api);
  const retry = await screen.findByRole('button', { name: 'Retry creation' });
  expect(retry.hasAttribute('disabled')).toBe(false);
  fireEvent.click(retry);
  await waitFor(() => expect(open).toHaveBeenCalledWith('created'));
  expect(create.mock.calls[1]![0]).toEqual(input);
  expect(sessionStorage.getItem('nevo:session-create:alice:spec:spec')).toBeNull();
});

it.each(['unavailable', 'unauthorized'] as const)(
  'omits a %s mode and starts in the first available one',
  async (failure) => {
    const f = fixture();
    const base = (await f.providers()).items[0]!;
    f.providers.mockResolvedValue({
      items: [
        {
          ...base,
          modes: ['read-only', 'workspace-write'],
          defaultModeId: 'agent',
          providerModes: [
            {
              ...writer,
              reason: 'Needs approval',
              ...(failure === 'unavailable'
                ? { readiness: 'unavailable' as const }
                : { authorized: false }),
            },
            plan,
          ],
        },
      ],
    });
    view(f.api);
    const planRadio = await screen.findByRole('radio', { name: 'Plan' });
    expect(screen.queryByRole('radio', { name: 'Agent' })).toBeNull();
    expect(screen.queryByText(/Needs approval/)).toBeNull();
    expect(planRadio.getAttribute('aria-checked')).toBe('true');
    await clickStart();
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    expect(f.create.mock.calls[0]?.[0]).toMatchObject({
      providerId: 'claude',
      providerModeId: 'plan',
      mode: 'read-only',
    });
  },
);

it('starts on the chosen provider with its own writer mode', async () => {
  const f = fixture();
  const base = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({
    items: [
      { ...base, providerModes: [plan] },
      {
        ...base,
        providerId: 'codex',
        title: 'Codex',
        modes: ['read-only', 'workspace-write'],
        defaultModeId: 'agent',
        providerModes: [writer],
      },
    ],
  });
  view(f.api);
  fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }));
  await clickStart();
  await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  expect(f.create.mock.calls[0]?.[0]).toMatchObject({
    providerId: 'codex',
    providerModeId: 'agent',
    mode: 'workspace-write',
  });
});

it('sends the chosen model, effort and an own name, and opens the Session with them', async () => {
  const f = fixture();
  f.create.mockReset().mockResolvedValue({ sessionId: 'created' });
  const base = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({
    items: [
      {
        ...base,
        models: [
          { modelId: 'm1', title: 'Model one', efforts: ['low', 'high'] },
          { modelId: 'm2', title: 'Model two', efforts: [] },
        ],
        modes: ['read-only', 'workspace-write'],
        defaultModeId: 'agent',
        providerModes: [writer, plan],
      },
    ],
  });
  view(f.api);
  expect(
    (await screen.findByRole('button', { name: 'Start session' })).hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByText('Choose a model.')).toBeDefined();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Model' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: 'Model one' }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Effort' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: 'high' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Give it your own name' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Session name' }), {
    target: { value: ' Review SSO ' },
  });
  await clickStart();
  await waitFor(() => expect(open).toHaveBeenCalledWith('created'));
  expect(f.create.mock.calls[0]?.[0]).toMatchObject({
    providerId: 'claude',
    modelId: 'm1',
    effort: 'high',
    mode: 'workspace-write',
    providerModeId: 'agent',
    title: 'Review SSO',
  });
  // The composed create's association seeds the Session's association read.
  expect(client.getQueryData(sessionAssociationKeys.read('created'))).toEqual({
    sessionId: 'created',
    association: {
      kind: 'specification',
      specification: {
        state: 'available',
        value: { specId: 'spec', key: 'SPEC-1', title: 'Login', collection: 'current' },
      },
      tasks: [],
    },
  });
  // What the Session was started with is handed to the screen that opens it.
  expect(startedSessionOf('alice', 'created')).toMatchObject({
    providerTitle: 'Claude',
    modelTitle: 'Model one',
    effort: 'high',
    modeId: 'agent',
    title: 'Review SSO',
  });
});

it('keeps a lost acknowledgement isolated when another identity creates a Session', async () => {
  const { api, create } = fixture();
  const alice = view(api);
  await clickStart();
  await screen.findByRole('button', { name: 'Retry creation' });
  const input = create.mock.calls[0]![0];
  alice.unmount();
  view(api, 'bob');
  await clickStart();
  await waitFor(() => expect(open).toHaveBeenCalledOnce());
  expect(create.mock.calls[1]![0].requestId).not.toBe(input.requestId);
  const retained = JSON.parse(
    sessionStorage.getItem('nevo:session-create:alice:spec:spec')!,
  ) as CreateSessionInput;
  expect(retained.requestId).toBe(input.requestId);
});

it('does not open a Session for another identity when an unmounted create is acknowledged', async () => {
  const { api, create } = fixture();
  let finish!: (result: { sessionId: string }) => void;
  create
    .mockReset()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ sessionId: 'bob-session' });
  const alice = view(api);
  await clickStart();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  alice.unmount();
  view(api, 'bob');
  await act(() => Promise.resolve(finish({ sessionId: 'alice-session' })));
  expect(open).not.toHaveBeenCalled();
  expect(startedSessionOf('alice', 'alice-session')).toBeUndefined();
  await clickStart();
  await waitFor(() => expect(open).toHaveBeenCalledWith('bob-session'));
});

const twoProviders = async (f: ReturnType<typeof fixture>) => {
  const base = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({
    items: [
      base,
      {
        ...base,
        providerId: 'codex',
        title: 'Codex',
        models: [{ modelId: 'm1', title: 'Model one', efforts: ['low', 'high'] }],
      },
    ],
  });
};

async function startCodexWithLostResponse(f: ReturnType<typeof fixture>) {
  const first = view(f.api);
  fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Model' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: 'Model one' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Give it your own name' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Session name' }), {
    target: { value: 'Review SSO' },
  });
  await clickStart();
  await screen.findByRole('button', { name: 'Retry creation' });
  first.unmount();
}

it('opens a resent request with what was sent, not with the fresh form of a reload', async () => {
  const f = fixture();
  await twoProviders(f);
  await startCodexWithLostResponse(f);
  view(f.api);
  // The form of the reloaded page holds its defaults (the first provider, nothing chosen).
  expect(await screen.findByRole('radio', { name: /Claude/ })).toBeDefined();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry creation' }));
  await waitFor(() => expect(open).toHaveBeenCalledWith('created'));
  expect(f.create.mock.calls[1]![0]).toEqual(f.create.mock.calls[0]![0]);
  expect(startedSessionOf('alice', 'created')).toMatchObject({
    providerId: 'codex',
    providerTitle: 'Codex',
    modelId: 'm1',
    modelTitle: 'Model one',
    title: 'Review SSO',
  });
});

it('keeps a kept request retryable while the provider catalogue cannot be read', async () => {
  const f = fixture();
  await twoProviders(f);
  await startCodexWithLostResponse(f);
  f.providers.mockRejectedValue(new Error('Catalogue unavailable'));
  view(f.api);
  expect(await screen.findByText('Unable to load the configuration')).toBeDefined();
  const retry = await screen.findByRole('button', { name: 'Retry creation' });
  expect(retry.hasAttribute('disabled')).toBe(false);
  fireEvent.click(retry);
  await waitFor(() => expect(open).toHaveBeenCalledWith('created'));
  expect(f.create.mock.calls[1]![0]).toEqual(f.create.mock.calls[0]![0]);
  // Nothing is known about the provider any more: the ids stand in for its titles.
  expect(startedSessionOf('alice', 'created')).toMatchObject({
    providerId: 'codex',
    modelId: 'm1',
    title: 'Review SSO',
  });
});

it('treats a ready provider without a usable work mode as unavailable, with the reason', async () => {
  const f = fixture();
  const base = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({
    items: [
      {
        ...base,
        modes: ['read-only', 'workspace-write'],
        providerModes: [{ ...writer, readiness: 'unavailable' as const, reason: 'Needs approval' }],
      },
      { ...base, providerId: 'codex', title: 'Codex', modes: [] },
    ],
  });
  view(f.api);
  expect(await screen.findByText('Needs approval')).toBeDefined();
  expect(screen.getByText('No work mode is available')).toBeDefined();
  expect(screen.getByRole('radio', { name: /Claude/ }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('radio', { name: /Codex/ }).hasAttribute('disabled')).toBe(true);
  // Never preselected; with every provider like that no executor is available.
  expect(screen.getByRole('radio', { name: /Claude/ }).getAttribute('aria-checked')).not.toBe(
    'true',
  );
  expect(screen.getByText('No executor is available right now.')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Start session' }).hasAttribute('disabled')).toBe(true);
});

it('prefers a provider that can start over one that cannot', async () => {
  const f = fixture();
  const base = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({
    items: [{ ...base, modes: [], title: 'Broken', providerId: 'broken' }, base],
  });
  view(f.api);
  expect((await screen.findByRole('radio', { name: /Claude/ })).hasAttribute('disabled')).toBe(
    false,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start session' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
});
