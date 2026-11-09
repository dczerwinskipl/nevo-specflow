// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createManagedSessionsApi, type ManagedSessionsApi } from '../api';
import { ArchivedSessionBar } from './ArchivedSessionBar';
import { useSessionActions } from './useSessionActions';

afterEach(cleanup);

type Session = SessionSnapshot['session'];
const sessionId = '00000000-0000-4000-8000-000000000001';
const session: Session = {
  sessionId,
  projectId: 'project',
  title: 'Release review',
  providerId: 'mock',
  mode: 'read-only',
  readiness: 'ready',
  capabilities: {
    view: true,
    manage: true,
    start: true,
    cancel: false,
    questions: true,
    permissions: true,
    delete: true,
  },
  createdAt: '2026-11-08T10:00:00Z',
  updatedAt: '2026-11-08T10:00:00Z',
};
const sessionError = (status: number, code: string) =>
  new HttpClientError(code, {
    kind: 'http',
    status,
    data: { error: 'session_error', code, message: code },
  });
const lost = () => new HttpClientError('offline', { kind: 'network' });

/** The hook's header actions as plain buttons, and its dialogs. */
function Harness(props: Parameters<typeof useSessionActions>[0]) {
  const { actions, dialogs, unarchive } = useSessionActions(props);

  return (
    <>
      {actions.map((action) => (
        <button key={action.id} type="button" data-action={action.id} onClick={action.onPress}>
          {action.label}
        </button>
      ))}
      <output data-testid="unarchive">
        {unarchive.pending ? 'pending' : (unarchive.failure ?? 'idle')}
      </output>
      {props.session?.archivedAt ? (
        <section aria-label="bar">
          <ArchivedSessionBar canManage unarchive={unarchive} />
        </section>
      ) : null}
      {dialogs}
    </>
  );
}

function renderActions(
  http: Partial<Record<'post' | 'delete', ReturnType<typeof vi.fn>>>,
  overrides: Partial<Parameters<typeof useSessionActions>[0]> = {},
) {
  const api: ManagedSessionsApi = createManagedSessionsApi(http as unknown as HttpRequestClient);
  const onDeleted = vi.fn();
  const onUnarchived = vi.fn();
  const query = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <LocalizationProvider instance={createSpecFlowI18n('pl')}>
      <QueryClientProvider client={query}>
        <Harness
          api={api}
          sessionId={sessionId}
          session={session}
          activeTurn={undefined}
          onDeleted={onDeleted}
          onUnarchived={onUnarchived}
          {...overrides}
        />
      </QueryClientProvider>
    </LocalizationProvider>,
  );

  return { ...view, api, query, onDeleted, onUnarchived };
}

const actionLabels = () =>
  [...document.querySelectorAll('[data-action]')].map((node) => node.textContent);
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const bar = () => screen.getByRole('region', { name: 'bar' });

describe('Session actions menu', () => {
  it.each([
    ['manage and delete', { manage: true, delete: true }, ['Zmień nazwę', 'Archiwizuj', 'Usuń']],
    ['manage only', { manage: true, delete: false }, ['Zmień nazwę', 'Archiwizuj']],
    ['delete only', { manage: false, delete: true }, ['Usuń']],
    ['neither', { manage: false, delete: false }, []],
  ])('omits what the capabilities do not allow: %s', (_name, capabilities, labels) => {
    renderActions(
      {},
      { session: { ...session, capabilities: { ...session.capabilities, ...capabilities } } },
    );
    expect(actionLabels()).toEqual(labels);
  });

  it('offers Restore instead of Archive on an archived Session, and keeps Rename', () => {
    renderActions({}, { session: { ...session, archivedAt: '2026-11-08T11:00:00Z' } });
    expect(actionLabels()).toEqual(['Zmień nazwę', 'Przywróć', 'Usuń']);
  });

  it('offers nothing before the Session projection is known', () => {
    renderActions({}, { session: undefined });
    expect(actionLabels()).toEqual([]);
  });
});

describe('Rename', () => {
  it('stays open and locked while unconfirmed, then a retry reuses the request id and closes', async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce(lost())
      .mockResolvedValue({ session: { ...session, title: 'Nowa' } });
    renderActions({ post });
    press('Zmień nazwę');
    const input = screen.getByRole('textbox', { name: 'Nazwa sesji' });
    fireEvent.change(input, { target: { value: '  Nowa  ' } });
    press('Zapisz');
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Nie potwierdzono operacji. Spróbuj ponownie.'),
    );
    expect(input).toHaveProperty('readOnly', true);
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveProperty('disabled', true);
    // Escape does not close a locked dialog.
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    press('Zapisz');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post.mock.calls[0]![0]).toBe(`/api/sessions/${sessionId}/rename`);
    expect(post.mock.calls[1]![1]).toEqual(post.mock.calls[0]![1]);
    expect(post.mock.calls[0]![1]).toMatchObject({ title: 'Nowa' });
  });

  it('shows the pending label, ignores presses meanwhile and unlocks Cancel on a refusal', async () => {
    const answer = Promise.withResolvers<never>();
    const post = vi.fn().mockReturnValue(answer.promise);
    renderActions({ post });
    press('Zmień nazwę');
    press('Zapisz');
    const pending = await screen.findByRole('button', { name: 'Zapisywanie…' });
    expect(pending.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(pending);
    expect(post).toHaveBeenCalledOnce();
    await act(async () => {
      answer.reject(sessionError(403, 'forbidden'));
      await answer.promise.catch(() => undefined);
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Nie masz już uprawnień do tej operacji.',
    );
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveProperty('disabled', false);
  });
});

describe('Archive', () => {
  it.each([
    ['active', 'Trwa tura. Zatrzymaj ją lub poczekaj na jej zakończenie.'],
    ['waitingForUser', 'Tura czeka na Twoją odpowiedź. Odpowiedz lub zatrzymaj turę.'],
    ['unknown', 'Najpierw ustal wynik ostatniej tury.'],
  ] as const)('cannot be confirmed with a %s Turn and says why', (state, note) => {
    const post = vi.fn();
    renderActions(
      { post },
      {
        activeTurn: { turnId: sessionId, state, revision: 1, startedAt: '2026-11-08T10:00:00Z' },
      },
    );
    press('Archiwizuj');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain(note);
    const confirm = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === 'Archiwizuj',
    )!;
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(confirm);
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the Turn note when a 409 TURN_CONFLICT wins a race', async () => {
    renderActions({ post: vi.fn().mockRejectedValue(sessionError(409, 'TURN_CONFLICT')) });
    press('Archiwizuj');
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(
      [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Archiwizuj')!,
    );
    await waitFor(() =>
      expect(dialog.textContent).toContain(
        'Trwa tura. Zatrzymaj ją lub poczekaj na jej zakończenie.',
      ),
    );
  });
});

describe('Restore', () => {
  it('runs directly, reuses the request id after an unconfirmed attempt and reports success', async () => {
    const post = vi.fn().mockRejectedValueOnce(lost()).mockResolvedValue({ session });
    const { onUnarchived } = renderActions(
      { post },
      { session: { ...session, archivedAt: '2026-11-08T11:00:00Z' } },
    );
    fireEvent.click(document.querySelector('[data-action="unarchive-session"]')!);
    await waitFor(() => expect(screen.getByTestId('unarchive').textContent).toBe('unconfirmed'));
    // The retry from the archived bar is the same command: the same request id.
    fireEvent.click(within(bar()).getByRole('button', { name: 'Przywróć' }));
    await waitFor(() => expect(onUnarchived).toHaveBeenCalledOnce());
    expect(post.mock.calls[0]![0]).toBe(`/api/sessions/${sessionId}/unarchive`);
    expect(post.mock.calls[1]![1]).toEqual(post.mock.calls[0]![1]);
  });

  it.each([
    ['unconfirmed', lost(), 'Nie potwierdzono operacji. Spróbuj ponownie.'],
    ['forbidden', sessionError(403, 'forbidden'), 'Nie masz już uprawnień do tej operacji.'],
    ['refused', sessionError(409, 'IDEMPOTENCY_CONFLICT'), 'Konfliktująca zmiana'],
  ])('says in the bar why Restore failed: %s', async (_name, error, copy) => {
    renderActions(
      { post: vi.fn().mockRejectedValue(error) },
      { session: { ...session, archivedAt: '2026-11-08T11:00:00Z' } },
    );
    fireEvent.click(within(bar()).getByRole('button', { name: 'Przywróć' }));
    await waitFor(() => expect(within(bar()).getByRole('alert').textContent).toBe(copy));
  });

  it('reuses the request id when the bar retries its own unconfirmed Restore', async () => {
    const post = vi.fn().mockRejectedValueOnce(lost()).mockResolvedValue({ session });
    renderActions({ post }, { session: { ...session, archivedAt: '2026-11-08T11:00:00Z' } });
    fireEvent.click(within(bar()).getByRole('button', { name: 'Przywróć' }));
    await waitFor(() => expect(screen.getByTestId('unarchive').textContent).toBe('unconfirmed'));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Przywróć' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]![1]).toEqual(post.mock.calls[0]![1]);
  });
});

describe('Delete with a Turn that has not ended', () => {
  it('unlocks Cancel after an unconfirmed attempt once a Turn blocks the command', async () => {
    const remove = vi.fn().mockRejectedValue(lost());
    const view = renderActions({ delete: remove });
    press('Usuń');
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Usuń')!);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveProperty('disabled', true),
    );
    view.rerender(
      <LocalizationProvider instance={createSpecFlowI18n('pl')}>
        <QueryClientProvider client={view.query}>
          <Harness
            api={view.api}
            sessionId={sessionId}
            session={session}
            activeTurn={{
              turnId: sessionId,
              state: 'active',
              revision: 1,
              startedAt: '2026-11-08T10:00:00Z',
            }}
          />
        </QueryClientProvider>
      </LocalizationProvider>,
    );
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveProperty('disabled', false);
  });
});

describe('Delete', () => {
  const confirmDelete = () => {
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Usuń')!);

    return dialog;
  };

  it('names the Session and is done on 204', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { onDeleted } = renderActions({ delete: remove });
    press('Usuń');
    expect(screen.getByRole('alertdialog').textContent).toContain('Release review');
    confirmDelete();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('treats 404 after an unconfirmed attempt as done', async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(lost())
      .mockRejectedValueOnce(sessionError(404, 'SESSION_NOT_FOUND'));
    const { onDeleted } = renderActions({ delete: remove });
    press('Usuń');
    confirmDelete();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Nie potwierdzono operacji. Spróbuj ponownie.',
    );
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveProperty('disabled', true);
    confirmDelete();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('refuses with SESSION_DELETE_BLOCKED: confirm stays enabled and Cancel unlocks', async () => {
    const remove = vi.fn().mockRejectedValue(sessionError(409, 'SESSION_DELETE_BLOCKED'));
    const { onDeleted } = renderActions({ delete: remove });
    press('Usuń');
    confirmDelete();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Sesja ma nierozliczone operacje w repozytorium. Spróbuj ponownie później.',
    );
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Usuń' })).toHaveProperty('disabled', false);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
