import type { WorkspaceActivityRecord, WorkspaceReadModel } from './repository';

/** At most this many activity events are returned, newest first. */
export const WORKSPACE_ACTIVITY_LIMIT = 50;
/** Stable id of the "Specification created" event; clients localize the event by it. */
export const SPECIFICATION_CREATED_EVENT_ID = 'specification-created';
/** Prefix of a "Session started" event id (`session-started.<sessionId>`); clients localize by it. */
export const SESSION_STARTED_EVENT_PREFIX = 'session-started.';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A Session of the workspace `sessions` section, as the activity history needs it. */
export interface WorkspaceSessionStart {
  readonly sessionId: string;
  /** Absent for an untitled Session; the server never invents a title. */
  readonly title?: string;
  /** ISO date-time the Session was created. */
  readonly createdAt: string;
}

/** The facts the activity history is composed from; each comes from its owner's read. */
export interface WorkspaceActivityInput {
  /** The manifest `created` value as stored; only a valid `YYYY-MM-DD` date becomes an event. */
  readonly created?: string;
  /** The associated non-archived Sessions of the bounded `sessions` section (at most 100). */
  readonly sessionStarts: readonly WorkspaceSessionStart[];
}

/**
 * Project mode's partial activity history: "Specification created" (from the manifest date) and one
 * "Session started" per associated Session of the bounded `sessions` section. Newest first; a
 * date-only value sorts as the start of its calendar day (UTC), so same-day Session events sort
 * above it. Session events carry `targetId = relatedSessionId = sessionId`, so the workspace
 * authorization drops every Session the caller may not view.
 */
export function composeWorkspaceActivity(
  input: WorkspaceActivityInput,
): WorkspaceReadModel['sections']['activity'] {
  const events: { record: WorkspaceActivityRecord; sortKey: string }[] = input.sessionStarts.map(
    (session) => ({
      record: {
        id: SESSION_STARTED_EVENT_PREFIX + session.sessionId,
        occurredAt: session.createdAt,
        kind: 'session',
        title: session.title ?? '',
        description: 'Session started',
        targetId: session.sessionId,
        relatedSessionId: session.sessionId,
      },
      sortKey: session.createdAt,
    }),
  );

  if (input.created !== undefined && isCalendarDate(input.created)) {
    events.push({
      record: {
        id: SPECIFICATION_CREATED_EVENT_ID,
        occurredAt: input.created,
        kind: 'info',
        title: 'Specification created',
        description: '',
      },
      sortKey: input.created + 'T00:00:00Z',
    });
  }

  const items = events
    .sort((a, b) => compareInstants(b.sortKey, a.sortKey))
    .slice(0, WORKSPACE_ACTIVITY_LIMIT)
    .map((event) => event.record);

  return { state: 'available', data: { items } };
}

/** A real calendar date in `YYYY-MM-DD` form (not `2026-02-30`). */
export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) {
    return false;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function compareInstants(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  return left - right;
}
