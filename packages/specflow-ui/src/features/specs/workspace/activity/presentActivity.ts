import type { TFunction } from 'i18next';
import { formatRelativeTime } from '../../../../shared/operations/panel/relativeTime';
import type { ActivityEvent } from '../../read-model/model';

/** The Runtime's stable id of the "Specification created" event (project mode). */
export const SPECIFICATION_CREATED_EVENT_ID = 'specification-created';
/** The Runtime's id prefix of a "Session started" event (`session-started.<sessionId>`). */
export const SESSION_STARTED_EVENT_PREFIX = 'session-started.';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T/u;

export function isSpecificationCreatedEvent(event: ActivityEvent): boolean {
  return event.kind === 'info' && event.id === SPECIFICATION_CREATED_EVENT_ID;
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
 * The event as shown: the Runtime's two project-mode events (identified by their stable ids) are
 * localized, an untitled Session gets the Sessions' untitled label and the time is formatted.
 */
export function presentActivityEvent(
  event: ActivityEvent,
  t: TFunction,
  now: number,
  locale: string,
): ActivityEvent {
  const time = formatActivityTime(event.time, now, locale);
  if (isSpecificationCreatedEvent(event)) {
    return { ...event, time, title: t('specification.activitySpecificationCreated') };
  }

  if (event.kind === 'session' && event.id.startsWith(SESSION_STARTED_EVENT_PREFIX)) {
    return {
      ...event,
      time,
      title: event.title || t('sessions.untitled'),
      description: t('specification.activitySessionStarted'),
    };
  }

  return { ...event, time };
}
