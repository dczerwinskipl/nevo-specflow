// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { NotificationProvider } from '../../../../shared/notifications/notifications';
import type { ReconcileState, SessionFeed } from '../feed';
import { UnknownTurnNotice } from './UnknownTurnNotice';

afterEach(cleanup);

const turnId = '00000000-0000-4000-8000-0000000000a1';

function renderNotice(reconciled: boolean | undefined, reconcile?: ReconcileState) {
  const result = reconciled === undefined ? undefined : { turnId, outcome: 'failed', reconciled };
  const feed = { reconcile: vi.fn().mockResolvedValue(result) } as unknown as SessionFeed;
  render(
    <LocalizationProvider instance={createSpecFlowI18n('pl')}>
      <NotificationProvider>
        <UnknownTurnNotice feed={feed} canManage reconcile={reconcile} />
      </NotificationProvider>
    </LocalizationProvider>,
  );

  return feed;
}

const press = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sprawdź wynik' }));
    await Promise.resolve();
  });
};

describe('UnknownTurnNotice', () => {
  it('confirms with a toast only when this check reconciled the Turn', async () => {
    renderNotice(true);
    await press();
    expect(await screen.findByText('Ustalono wynik tury.')).toBeTruthy();
  });

  it.each([
    ['already settled elsewhere (reconciled: false)', false],
    ['not answered', undefined],
  ])('shows no toast when %s', async (_name, reconciled) => {
    renderNotice(reconciled);
    await press();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText('Ustalono wynik tury.')).toBeNull();
  });

  it('keeps the check pending after a 200 until the Turn leaves unknown', () => {
    const reconcile = vi.fn();
    const feed = renderNotice(true, { turnId, status: 'settled' });
    feed.reconcile = reconcile;
    const button = screen.getByRole('button', { name: 'Sprawdzanie…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it.each([
    [
      { status: 'refused', errorKind: 'forbidden' } as const,
      'Nie masz już uprawnień do tej operacji.',
    ],
    [{ status: 'unconfirmed' } as const, 'Nie potwierdzono sprawdzenia. Spróbuj ponownie.'],
  ])('says why a check failed: %o', (state, copy) => {
    renderNotice(undefined, { turnId, ...state });
    expect(screen.getByRole('alert').textContent).toBe(copy);
  });
});
