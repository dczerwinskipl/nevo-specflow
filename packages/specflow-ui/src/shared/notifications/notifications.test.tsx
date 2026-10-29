// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../i18n';
import { NotificationProvider, useNotify } from './notifications';

function Trigger() {
  const notify = useNotify();

  return (
    <button type="button" onClick={() => notify('Saved')}>
      notify
    </button>
  );
}

afterEach(cleanup);

describe('notification toast', () => {
  it.each([
    ['en', 'Dismiss notification'],
    ['pl', 'Zamknij powiadomienie'],
  ] as const)('labels its dismiss control from the %s catalogue', async (locale, label) => {
    render(
      <LocalizationProvider instance={createSpecFlowI18n(locale)}>
        <NotificationProvider>
          <Trigger />
        </NotificationProvider>
      </LocalizationProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'notify' }).click();
    });
    expect(await screen.findByRole('button', { name: label })).toBeTruthy();
  });

  it('announces with a translated label and names its region in the catalogue language', async () => {
    render(
      <LocalizationProvider instance={createSpecFlowI18n('pl')}>
        <NotificationProvider>
          <Trigger />
        </NotificationProvider>
      </LocalizationProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'notify' }).click();
    });
    expect(await screen.findByRole('region', { name: /^Powiadomienia \(F8\)/ })).toBeTruthy();
    const announced = await screen.findByText(/Powiadomienie/);
    expect(announced.textContent).not.toContain('Notification');
  });
});
