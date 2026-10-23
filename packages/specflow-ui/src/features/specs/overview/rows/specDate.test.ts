import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSpecDate } from './specDate';

afterEach(() => vi.unstubAllEnvs());

describe('formatSpecDate', () => {
  it('shows a calendar day as written, whatever the time zone', () => {
    expect(formatSpecDate('2026-09-01', 'en')).toBe('Sep 1, 2026');
  });

  it('shows an instant as the day in the reader time zone', () => {
    const instant = '2026-09-01T23:30:00Z';
    const expected = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(instant));
    expect(formatSpecDate(instant, 'en')).toBe(expected);
  });

  it('formats in the given language', () => {
    expect(formatSpecDate('2026-09-01', 'pl')).toMatch(/2026/);
    expect(formatSpecDate('2026-09-01', 'pl')).not.toBe(formatSpecDate('2026-09-01', 'en'));
  });
});
