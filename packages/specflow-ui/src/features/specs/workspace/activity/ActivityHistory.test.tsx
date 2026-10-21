import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { appI18n } from '../../../../i18n';
import { ActivityHistory } from './ActivityHistory';
import type { ActivityEvent } from '../model';

describe('ActivityHistory', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('pl');
  });

  it('shows a truthful empty state distinct from the timeline when there are no events', () => {
    const html = renderToStaticMarkup(<ActivityHistory events={[]} />);
    expect(html).toContain('Brak historii tej specyfikacji');
    expect(html).toContain('Zdarzenia pojawią się tutaj podczas pracy nad specyfikacją.');
  });

  it('renders the Timeline, not the empty state, when events are present', () => {
    const events: ActivityEvent[] = [
      {
        id: 'evt-1',
        kind: 'info',
        title: 'Utworzono specyfikację',
        description: 'Specyfikacja powstała z workflow Feature.',
        time: '2026-01-01T00:00:00Z',
      },
    ];
    const html = renderToStaticMarkup(<ActivityHistory events={events} />);
    expect(html).not.toContain('Brak historii tej specyfikacji');
  });

  it('renders an unavailable activity source as a failure, not as an empty history', () => {
    let retried = false;
    const html = renderToStaticMarkup(
      <ActivityHistory events={[]} availability="unavailable" onRetry={() => (retried = true)} />,
    );
    expect(html).not.toContain('Brak historii tej specyfikacji');
    expect(html).toContain('Nie udało się wczytać historii');
    expect(html).toContain('Spróbuj ponownie');
    expect(retried).toBe(false);
  });

  it('does not offer retry for a forbidden activity source', () => {
    const html = renderToStaticMarkup(
      <ActivityHistory events={[]} availability="forbidden" onRetry={() => undefined} />,
    );
    expect(html).toContain('Brak dostępu do historii');
    expect(html).not.toContain('Spróbuj ponownie');
  });

  it('shows a calm not-yet-available state without retry when the Runtime lacks the source', () => {
    const html = renderToStaticMarkup(
      <ActivityHistory
        events={[]}
        availability="unavailable"
        unavailableReason="not_implemented"
        onRetry={() => undefined}
      />,
    );
    expect(html).toContain('Niedostępne w tym Runtime');
    expect(html).not.toContain('Nie udało się wczytać historii');
    expect(html).not.toContain('Spróbuj ponownie');
  });
});
