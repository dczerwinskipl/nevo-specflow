/** A value without a time part ("2026-09-01") has no time zone; it names a calendar day. */
const calendarDay = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * The one date rule of the overview rows (Current "Updated" and Archive milestones): an instant is
 * shown as the calendar day in the reader's own time zone, a value that is only a calendar day is
 * shown as that day whatever the reader's zone. Dates read the same in both collections.
 */
export function formatSpecDate(value: string, language: string | undefined): string {
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(calendarDay.test(value) ? { timeZone: 'UTC' } : {}),
  }).format(new Date(value));
}
