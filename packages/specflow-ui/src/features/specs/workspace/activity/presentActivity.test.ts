import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../../i18n';
import { formatActivityTime, presentActivityEvent } from './presentActivity';

const now = Date.parse('2026-11-08T12:00:00.000Z');

describe('formatActivityTime', () => {
  it('formats a date-only value as its calendar date, never shifted by the time zone', () => {
    // The formatter must not depend on the host zone: the day is formatted in UTC from its numbers.
    const original = process.env.TZ;
    try {
      for (const zone of ['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = zone;
        expect(formatActivityTime('2026-11-08', now, 'pl')).toBe('8 lis 2026');
        expect(formatActivityTime('2026-01-01', now, 'en')).toBe('Jan 1, 2026');
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('formats an ISO date-time as a relative time', () => {
    expect(formatActivityTime('2026-11-08T11:55:00.000Z', now, 'en')).toBe('5 minutes ago');
    expect(formatActivityTime('2026-11-08T10:00:00Z', now, 'pl')).toBe('2 godziny temu');
  });

  it('leaves preformatted text unchanged', () => {
    expect(formatActivityTime('5 min temu', now, 'pl')).toBe('5 min temu');
  });
});

describe('presentActivityEvent', () => {
  const i18n = createSpecFlowI18n('pl');

  it('localizes the known Runtime events by their semantic event, not by id', () => {
    expect(
      presentActivityEvent(
        {
          id: 'specification-created',
          event: 'specification_created',
          kind: 'info',
          time: '2026-11-08',
          title: 'Specification created',
          description: '',
        },
        i18n.t,
        now,
        'pl',
      ),
    ).toMatchObject({ title: 'Utworzono specyfikację', time: '8 lis 2026' });
    expect(
      presentActivityEvent(
        {
          id: 'session-started.s-1',
          event: 'session_started',
          kind: 'session',
          targetId: 's-1',
          time: '2026-11-08T11:55:00.000Z',
          title: 'Przygotowanie wymagań',
          description: 'Session started',
        },
        i18n.t,
        now,
        'pl',
      ),
    ).toMatchObject({ title: 'Przygotowanie wymagań', description: 'Rozpoczęto sesję' });
  });

  it('keeps other events as the source wrote them', () => {
    expect(
      presentActivityEvent(
        { id: 'other', kind: 'info', time: 'Teraz', title: 'Własny', description: 'Opis' },
        i18n.t,
        now,
        'pl',
      ),
    ).toEqual({ id: 'other', kind: 'info', time: 'Teraz', title: 'Własny', description: 'Opis' });
  });
});
