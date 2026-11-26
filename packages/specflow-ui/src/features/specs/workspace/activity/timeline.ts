import type { WorkflowTimelineEntry } from '../../../tasks';
import type { ActivityEvent } from '../../read-model/model';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** One entry of the Activity history: a workflow entry or a Specification event. */
export type ActivityTimelineEntry =
  | { readonly kind: 'workflow'; readonly key: string; readonly entry: WorkflowTimelineEntry }
  | { readonly kind: 'event'; readonly key: string; readonly event: ActivityEvent };

/** A day of the Activity history; `day` is absent for entries whose time is not a date. */
export interface ActivityDay {
  readonly key: string;
  readonly day?: Date;
  readonly entries: readonly ActivityTimelineEntry[];
}

/**
 * When an event or a workflow entry happened, for ordering and grouping: an ISO date-time as is, a
 * date-only value as the start of that calendar day where the viewer is (it opens its day, never
 * shifts to another), anything else as no time.
 */
export function activityInstant(value: string): Date | undefined {
  const date = CALENDAR_DATE.exec(value);
  if (date) {
    return new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * The one place the Specification's Activity history is composed (specification-overview.md,
 * "Activity history"): the workflow entries (agent attempts, the owner's own attempts, Confirm and
 * Reject, returns) and the Specification's events, in one chronological list, newest first. A
 * "Session started" event of a Session an attempt already represents is left out (the attempt's
 * Open session reaches it); a Session outside the workflow keeps its event. Ties keep the run's
 * record order, newest first; an entry with no time comes last, in the order given.
 */
export function composeActivityTimeline(
  workflow: {
    readonly entries: readonly WorkflowTimelineEntry[];
    readonly sessionIds: ReadonlySet<string>;
  },
  events: readonly ActivityEvent[],
): ActivityTimelineEntry[] {
  const timed: { entry: ActivityTimelineEntry; at?: number; order: number }[] = [
    ...workflow.entries.map((entry) => ({
      entry: { kind: 'workflow' as const, key: `workflow-${entry.key}`, entry },
      ...instantOf(entry.at),
      order: entry.order,
    })),
    ...events
      .filter(
        (event) =>
          !(
            event.event === 'session_started' &&
            event.kind === 'session' &&
            workflow.sessionIds.has(event.targetId)
          ),
      )
      .map((event, index) => ({
        entry: { kind: 'event' as const, key: `event-${event.id}`, event },
        ...instantOf(event.time),
        // Events keep their given order (newest first) among equal times.
        order: -index,
      })),
  ];

  return timed
    .sort((a, b) => {
      if (a.at === undefined || b.at === undefined) {
        return a.at === undefined ? (b.at === undefined ? 0 : 1) : -1;
      }

      return b.at - a.at || b.order - a.order;
    })
    .map((item) => item.entry);
}

function instantOf(value: string): { at?: number } {
  const instant = activityInstant(value);

  return instant ? { at: instant.getTime() } : {};
}

/** The entries by the day they happened, in their order. */
export function activityDays(entries: readonly ActivityTimelineEntry[]): ActivityDay[] {
  const days: { key: string; day?: Date; entries: ActivityTimelineEntry[] }[] = [];
  for (const entry of entries) {
    const day = activityInstant(entry.kind === 'workflow' ? entry.entry.at : entry.event.time);
    const key = day ? day.toDateString() : 'undated';
    const last = days.at(-1);
    if (last?.key === key) {
      last.entries.push(entry);
    } else {
      days.push({ key, ...(day ? { day } : {}), entries: [entry] });
    }
  }

  return days;
}
