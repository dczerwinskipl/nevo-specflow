// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClientError } from '@nevo/http-client';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { ApiError } from '../../../api';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { installWorkspaceWidth } from '../../../test-support/workspaceWidth.test-support';
import type { ManagedSessionsApi } from './api';
import { ManagedSession } from './ManagedSession';
import {
  fixtureApi,
  fixtureSessionId,
  providerFixture,
  sessionFixture,
  withRuntimeTitles,
} from './managedSession.stories-support';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.scrollTo = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  window.scrollTo = () => undefined;
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
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderSession(
  start: ManagedSessionsApi['start'],
  overrides: Partial<ManagedSessionsApi> = {},
  snapshot: SessionSnapshot = sessionFixture(),
) {
  installWorkspaceWidth(1280);
  const api = { ...fixtureApi(withRuntimeTitles(snapshot)), start, ...overrides };

  render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AppShell navigation={<div>Navigation</div>}>
          <AppWorkspaceProvider>
            <ManagedSession sessionId={fixtureSessionId} owner="owner-1" api={api} />
          </AppWorkspaceProvider>
        </AppShell>
      </QueryClientProvider>
    </LocalizationProvider>,
  );
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function typeAndSend(message: string) {
  await settle();
  const editor = await screen.findByLabelText('Message');
  fireEvent.change(editor, { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await settle();

  return editor as HTMLTextAreaElement;
}

const refusal = (code: string) =>
  new ApiError({
    kind: 'conflict',
    operation: 'sessions.start',
    outcome: 'not-applied',
    retryable: false,
    status: 409,
    code,
  });

describe('the Composer Send', () => {
  it('shows the send at once and locks the message while the Runtime has not answered', async () => {
    let answer!: (value: { turnId: string }) => void;
    const start = vi.fn<ManagedSessionsApi['start']>(
      () => new Promise((resolve) => (answer = resolve)),
    );
    renderSession(start);

    const editor = await typeAndSend('Please review');

    expect(screen.getByRole('status', { name: 'Sending…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(editor.disabled).toBe(true);
    expect(editor.value).toBe('Please review');
    // No second request while the first is in flight.
    fireEvent.submit(editor.closest('form')!);
    await settle();
    expect(start).toHaveBeenCalledOnce();

    await act(async () => {
      answer({ turnId: 'turn-2' });
      await Promise.resolve();
    });
    await settle();
    expect(screen.queryByRole('status', { name: 'Sending…' })).toBeNull();
    expect(editor.value).toBe('');
  });

  it('says in plain words why the Runtime refused it and keeps the message', async () => {
    renderSession(vi.fn<ManagedSessionsApi['start']>().mockRejectedValue(refusal('TURN_CONFLICT')));

    const editor = await typeAndSend('Please review');

    expect(screen.getByText(/writing to this project right now/)).toBeTruthy();
    expect(editor.disabled).toBe(false);
    expect(editor.value).toBe('Please review');
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('keeps a send whose answer timed out and says it may still start', async () => {
    const start = vi.fn<ManagedSessionsApi['start']>().mockRejectedValue(
      new ApiError({
        kind: 'timeout',
        operation: 'sessions.start',
        outcome: 'unknown',
        retryable: true,
      }),
    );
    renderSession(start);

    const editor = await typeAndSend('Please review');

    expect(screen.getByText(/does not know whether the message arrived/)).toBeTruthy();
    expect(editor.value).toBe('Please review');
    fireEvent.click(screen.getByRole('button', { name: 'Retry sending' }));
    await settle();
    // The retry is the same request (its id makes it run at most once).
    expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
  });

  it('releases the Composer on a recovery refusal: nothing was started, and says the way on', async () => {
    const start = vi.fn<ManagedSessionsApi['start']>().mockRejectedValue(
      new ApiError({
        kind: 'recovery-required',
        operation: 'sessions.start',
        // The transport keeps this code open for every command; a start refused it definitely.
        outcome: 'unknown',
        retryable: false,
        status: 409,
        code: 'SESSION_RECOVERY_REQUIRED',
      }),
    );
    renderSession(start);

    const editor = await typeAndSend('Please review');

    expect(screen.getByText(/Start a new Session to go on/)).toBeTruthy();
    expect(screen.queryByText(/does not know whether the message arrived/)).toBeNull();
    expect(editor.disabled).toBe(false);
    expect(editor.value).toBe('Please review');
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('names a refused work mode and model pair instead of calling the model unavailable', async () => {
    const start = vi.fn<ManagedSessionsApi['start']>().mockRejectedValue(
      new ApiError({
        kind: 'validation',
        operation: 'sessions.start',
        outcome: 'not-applied',
        retryable: false,
        status: 422,
        code: 'MODEL_UNSUPPORTED',
        cause: new HttpClientError('422', {
          kind: 'http',
          status: 422,
          data: {
            code: 'MODEL_UNSUPPORTED',
            details: { reason: 'mode-model-unsupported', field: 'providerModeId' },
          },
        }),
      }),
    );
    renderSession(start);

    const editor = await typeAndSend('Please review');

    expect(screen.getByText(/work mode does not run this model/)).toBeTruthy();
    expect(screen.queryByText(/The chosen model is not available/)).toBeNull();
    expect(editor.disabled).toBe(false);
  });

  it.each([
    ['did not arrive: frees the message to edit', false],
    ['arrived: confirms it with the same request', true],
  ])('checks the Session after a lost answer; the message %s', async (_name, arrived) => {
    const timeout = new ApiError({
      kind: 'timeout',
      operation: 'sessions.start',
      outcome: 'unknown',
      retryable: true,
    });
    const start = vi
      .fn<ManagedSessionsApi['start']>()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValue({ turnId: 'turn-2' });
    const served = withRuntimeTitles(sessionFixture());
    const snapshot = vi.fn<ManagedSessionsApi['snapshot']>().mockResolvedValue(served);
    renderSession(start, { snapshot });
    const editor = await typeAndSend('Please review');
    expect(editor.disabled).toBe(true);
    if (arrived) {
      snapshot.mockResolvedValue({
        ...served,
        entries: [
          ...served.entries,
          {
            id: 'arrived',
            turnId: 'turn-2',
            ordinal: 9,
            revision: 1,
            kind: 'request',
            createdAt: '2026-10-25T10:05:00Z',
            text: { text: 'Please review', complete: true },
          },
        ],
      });
    }

    fireEvent.click(screen.getByRole('button', { name: 'Check the Session' }));
    await settle();

    if (arrived) {
      expect(start).toHaveBeenCalledTimes(2);
      expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
      expect(editor.value).toBe('');
    } else {
      expect(start).toHaveBeenCalledOnce();
      expect(editor.disabled).toBe(false);
      expect(editor.value).toBe('Please review');
      expect(screen.queryByText(/does not know whether the message arrived/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    }
  });

  it('says before sending that the work mode does not run the model, and does not send', async () => {
    const provider = providerFixture();
    const start = vi.fn<ManagedSessionsApi['start']>();
    const served = sessionFixture();
    renderSession(
      start,
      {
        providers: () =>
          Promise.resolve({
            items: [
              {
                ...provider,
                providerModes: provider.providerModes!.map((mode) =>
                  mode.modeId === 'default' ? { ...mode, modelIds: ['mock-standard'] } : mode,
                ),
              },
            ],
          }),
      },
      {
        ...served,
        session: { ...served.session, modelId: 'mock-fast', providerModeId: 'default' },
      },
    );
    await settle();
    const editor = await screen.findByLabelText('Message');
    fireEvent.change(editor, { target: { value: 'Please review' } });
    await settle();

    expect(
      screen.getByText('Agent does not run Fast. Pick another model or work mode to send.'),
    ).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
    fireEvent.submit(editor.closest('form')!);
    await settle();
    expect(start).not.toHaveBeenCalled();
  });

  it('sends where crypto.randomUUID is missing (plain http)', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const start = vi.fn<ManagedSessionsApi['start']>().mockResolvedValue({ turnId: 'turn-2' });
    renderSession(start);

    await typeAndSend('Please review');

    expect(start).toHaveBeenCalledOnce();
    expect(start.mock.calls[0]![1].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('the conversation', () => {
  it('says an interrupted Turn once, with the SpecFlow notice that caused it, apart from the agent words', async () => {
    const served = sessionFixture();
    const turnId = served.entries[0]!.turnId;
    renderSession(
      vi.fn<ManagedSessionsApi['start']>(),
      {},
      {
        ...served,
        history: { hasOlder: false },
        entries: [
          served.entries[0]!,
          {
            id: 'agent-commentary',
            turnId,
            ordinal: 2,
            revision: 1,
            kind: 'commentary',
            createdAt: '2026-10-25T10:00:01Z',
            text: { text: 'Reading the files.', complete: true },
          },
          {
            id: 'notice',
            turnId,
            ordinal: 3,
            revision: 1,
            kind: 'commentary',
            notice: { severity: 'error' },
            createdAt: '2026-10-25T10:00:02Z',
            text: { text: 'SpecFlow stopped the Claude process.', complete: true },
          },
          {
            id: 'outcome',
            turnId,
            ordinal: 4,
            revision: 1,
            kind: 'outcome',
            createdAt: '2026-10-25T10:00:03Z',
            text: { text: 'interrupted', complete: true },
            error: { code: 'PROCESS_STOPPED', message: 'The agent process stopped.' },
          },
        ],
      },
    );
    await settle();

    // The error notice is the cause of the interruption: said once, in the Turn's outcome event,
    // never as a row of its own.
    expect(document.querySelector('[data-entry-id="notice"]')).toBeNull();
    const commentary = document.querySelector('[data-entry-id="agent-commentary"]')!;
    expect(commentary.textContent).not.toContain('SpecFlow');
    const outcome = document.querySelector('[data-entry-id="outcome"]')!;
    expect(outcome.getAttribute('data-turn-outcome')).toBe('interrupted');
    expect(outcome.querySelector('svg')).toBeTruthy();
    expect(outcome.textContent).toContain('Turn interrupted');
    expect(outcome.textContent).toContain('SpecFlow stopped the Claude process.');
    expect(document.body.textContent?.match(/SpecFlow stopped the Claude process/g)).toHaveLength(
      1,
    );
  });
});
