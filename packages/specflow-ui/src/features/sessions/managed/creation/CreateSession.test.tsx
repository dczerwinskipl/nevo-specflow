// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@nevo/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ManagedSessionsApi } from '../api';
import type {
  CreateSession as CreateSessionInput,
  ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { CreateSession } from './CreateSession';

const navigate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
beforeEach(() =>
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
  ),
);
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  navigate.mockClear();
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
    .fn<ManagedSessionsApi['create']>()
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockResolvedValue({ sessionId: 'created' });
  return { providers, create, api: { providers, create } as unknown as ManagedSessionsApi };
}
function view(api: ManagedSessionsApi, owner = 'alice') {
  return render(
    <StrictMode>
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AppShell navigation={<div>Navigation</div>}>
            <CreateSession owner={owner} api={api} />
          </AppShell>
        </QueryClientProvider>
      </LocalizationProvider>
    </StrictMode>,
  );
}
async function clickCreate() {
  const button = await screen.findByRole('button', { name: 'Create session' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
}
it('defaults to the provider native writable mode and retains it on a lost response', async () => {
  const f = fixture();
  const base = (await f.providers()).items[0]!;
  f.providers.mockResolvedValue({
    items: [
      {
        ...base,
        modes: ['read-only', 'workspace-write'],
        defaultModeId: 'acceptEdits',
        providerModes: [
          {
            modeId: 'acceptEdits',
            title: 'Accept edits',
            nativeMode: 'acceptEdits',
            mode: 'workspace-write',
            readiness: 'ready',
            authorized: true,
          },
          {
            modeId: 'plan',
            title: 'Plan',
            nativeMode: 'plan',
            mode: 'read-only',
            readiness: 'ready',
            authorized: true,
          },
        ],
      },
    ],
  });
  view(f.api);
  await clickCreate();
  expect(f.create.mock.calls[0]?.[0]).toMatchObject({
    mode: 'workspace-write',
    providerModeId: 'acceptEdits',
  });
  await screen.findByRole('button', { name: 'Retry creation' });
});

it('retries a retained create after remount even when the provider becomes unavailable', async () => {
  const { api, create, providers } = fixture();
  const first = view(api);
  await clickCreate();
  await screen.findByRole('button', { name: 'Retry creation' });
  const input = create.mock.calls[0]![0];
  first.unmount();
  providers.mockResolvedValue({ items: [] });
  view(api);
  const retry = await screen.findByRole('button', { name: 'Retry creation' });
  expect(retry.hasAttribute('disabled')).toBe(false);
  fireEvent.click(retry);
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({
      to: '/sessions/$sessionId',
      params: { sessionId: 'created' },
    }),
  );
  expect(create.mock.calls[1]![0]).toEqual(input);
  expect(sessionStorage.getItem('nevo:session-create:alice')).toBeNull();
});

it.each(['unavailable', 'unauthorized'] as const)(
  'chooses a ready authorized Agent on another provider when the first writer is %s',
  async (failure) => {
    const f = fixture();
    const base = (await f.providers()).items[0]!;
    const writer = {
      modeId: 'agent',
      nativeMode: 'agent',
      title: 'Agent',
      mode: 'workspace-write' as const,
      readiness: 'ready' as const,
      authorized: true,
    };
    f.providers.mockResolvedValue({
      items: [
        {
          ...base,
          modes: ['read-only', 'workspace-write'],
          defaultModeId: 'agent',
          providerModes: [
            {
              ...writer,
              ...(failure === 'unavailable'
                ? { readiness: 'unavailable' as const }
                : { authorized: false }),
            },
            {
              modeId: 'plan',
              nativeMode: 'plan',
              title: 'Plan',
              mode: 'read-only',
              readiness: 'ready',
              authorized: true,
            },
          ],
        },
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
    await clickCreate();
    expect(f.create.mock.calls[0]?.[0]).toMatchObject({
      providerId: 'codex',
      providerModeId: 'agent',
      mode: 'workspace-write',
    });
  },
);

it('selects an available Plan when no authorized writer is available', async () => {
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
            modeId: 'agent',
            nativeMode: 'agent',
            title: 'Agent',
            mode: 'workspace-write',
            readiness: 'unavailable',
            authorized: true,
          },
          {
            modeId: 'plan',
            nativeMode: 'plan',
            title: 'Plan',
            mode: 'read-only',
            readiness: 'ready',
            authorized: true,
          },
        ],
      },
    ],
  });
  view(f.api);
  await clickCreate();
  expect(f.create.mock.calls[0]?.[0]).toMatchObject({
    providerId: 'claude',
    providerModeId: 'plan',
    mode: 'read-only',
  });
});

it('keeps a lost acknowledgement isolated when another identity creates a Session', async () => {
  const { api, create } = fixture();
  const alice = view(api);
  await clickCreate();
  await screen.findByRole('button', { name: 'Retry creation' });
  const input = create.mock.calls[0]![0];
  alice.unmount();
  view(api, 'bob');
  await clickCreate();
  await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  expect(create.mock.calls[1]![0].requestId).not.toBe(input.requestId);
  const retained = JSON.parse(
    sessionStorage.getItem('nevo:session-create:alice')!,
  ) as CreateSessionInput;
  expect(retained.requestId).toBe(input.requestId);
});

it('does not navigate another identity when an unmounted create receives its acknowledgement', async () => {
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
  await clickCreate();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  alice.unmount();
  view(api, 'bob');
  await act(() => Promise.resolve(finish({ sessionId: 'alice-session' })));
  expect(navigate).not.toHaveBeenCalled();
  await clickCreate();
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({
      to: '/sessions/$sessionId',
      params: { sessionId: 'bob-session' },
    }),
  );
});
