import type { TFunction } from 'i18next';
import { formatRelativeTime } from '../../../../shared/operations/panel/relativeTime';
import type { ActivityEvent } from '../../read-model/model';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T/u;

export function isSpecificationCreatedEvent(event: ActivityEvent): boolean {
  return event.event === 'specification_created';
}

/**
 * An activity time for display: an ISO date-time as a relative time ("5 minut temu"), a date-only
 * value as its calendar date ("8 lis 2026") without any time-zone conversion, and any other text
 * (a preformatted demo value) unchanged.
 */
export function formatActivityTime(value: string, now: number, locale: string): string {
  const date = CALENDAR_DATE.exec(value);
  if (date) {
    // The three numbers name a calendar day; formatting that day in UTC never shifts it.
    const day = new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])));

    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(day);
  }

  if (DATE_TIME.test(value)) {
    return formatRelativeTime(value, now, locale) ?? value;
  }

  return value;
}

/**
 * The event as shown: the Runtime's known events (their semantic `event`) are localized, an
 * untitled Session gets the Sessions' untitled label and the time is formatted.
 */
export function presentActivityEvent(
  event: ActivityEvent,
  t: TFunction,
  now: number,
  locale: string,
): ActivityEvent {
  const time = formatActivityTime(event.time, now, locale);
  switch (event.event) {
    case 'specification_created':
      return { ...event, time, title: t('specification.activitySpecificationCreated') };
    case 'session_started':
      return {
        ...event,
        time,
        title: event.title || t('sessions.untitled'),
        description: t('specification.activitySessionStarted'),
      };
    default:
      return { ...event, time };
  }
}
