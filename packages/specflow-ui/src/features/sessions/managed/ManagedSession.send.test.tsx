// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { installWorkspaceWidth } from '../../../test-support/workspaceWidth.test-support';
import type { ManagedSessionsApi } from './api';
import { ManagedSession } from './ManagedSession';
import {
  fixtureApi,
  fixtureSessionId,
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

function renderSession(start: ManagedSessionsApi['start']) {
  installWorkspaceWidth(1280);
  const api = { ...fixtureApi(withRuntimeTitles(sessionFixture())), start };

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

    expect(screen.getByText(/did not confirm that the message arrived/)).toBeTruthy();
    expect(editor.value).toBe('Please review');
    fireEvent.click(screen.getByRole('button', { name: 'Retry sending' }));
    await settle();
    // The retry is the same request (its id makes it run at most once).
    expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
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
