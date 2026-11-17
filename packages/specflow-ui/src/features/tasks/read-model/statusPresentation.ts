import type { IconName, StatusTone } from '@nevo/ui';
import type { SemanticSupporting } from '../../../shared/operational-list';

/**
 * The presented status ids of a Task (the Runtime's `TaskStatusLine.id`), the keys of the one status
 * presentation model.
 */
export const TASK_STATUS_IDS = [
  'draft',
  'ready',
  'waiting',
  'in-progress',
  'on-hold',
  'blocked',
  'completed',
  'cancelled',
  'abandoned',
  'broken',
] as const;
export type TaskStatusId = (typeof TASK_STATUS_IDS)[number];

/**
 * How a Task status reads on every surface: one mark (an icon, or the `StatusIndicator` dot) and its
 * tone, plus the label's class. The label stays `content-secondary` except for danger (and the muted
 * Cancelled label); the colour of the other tones is carried by the mark alone. Requires attention is
 * not a status: it is the overlay of `taskAttentionOverlay`.
 */
export interface TaskStatePresentation {
  /** The status mark; absent with `indicator` (a dot) and for a status without a mark yet. */
  readonly icon?: IconName;
  /** The `StatusIndicator` dot's tone, for a status whose mark is a dot. */
  readonly indicator?: StatusTone;
  readonly tone: StatusTone;
  readonly iconClassName?: string;
  /** The label's own tone: only danger takes it (`SemanticSupporting.tone`). */
  readonly labelTone?: 'danger';
  readonly textClassName?: string;
  /** The standard spinning loader (static under `prefers-reduced-motion`). */
  readonly animate?: boolean;
}

/** The DS spinner's motion: it spins, except under `prefers-reduced-motion`. */
const SPINNING = 'animate-spin motion-reduce:animate-none';

const PRESENTATION: Record<TaskStatusId, TaskStatePresentation> = {
  draft: { icon: 'edit', tone: 'neutral' },
  // The next thing that can run: an info dot, the label stays neutral.
  ready: { indicator: 'info', tone: 'info' },
  waiting: { icon: 'clock', tone: 'neutral' },
  'in-progress': {
    icon: 'loader',
    tone: 'info',
    iconClassName: `text-status-info ${SPINNING}`,
    animate: true,
  },
  // Not attention by itself: the Engine's attention item adds the overlay when it holds up work.
  'on-hold': { icon: 'circle-pause', tone: 'neutral' },
  // Today's presentation until a Blocked state is designed: the label alone, neutral.
  blocked: { tone: 'neutral' },
  completed: { icon: 'circle-check', tone: 'success', iconClassName: 'text-status-success' },
  cancelled: {
    icon: 'close',
    tone: 'neutral',
    iconClassName: 'text-content-muted',
    textClassName: 'text-content-muted',
  },
  // Its workflow ended without completing: closed like a cancelled Task, not a failure.
  abandoned: {
    icon: 'close',
    tone: 'neutral',
    iconClassName: 'text-content-muted',
    textClassName: 'text-content-muted',
  },
  broken: {
    icon: 'circle-alert',
    tone: 'danger',
    iconClassName: 'text-status-danger',
    labelTone: 'danger',
  },
};

const isTaskStatusId = (value: string): value is TaskStatusId =>
  Object.prototype.hasOwnProperty.call(PRESENTATION, value);

/**
 * The presentation of a Task status by its presented id. An id the model does not know (the
 * contract's id is an open string) reads like a status without a mark: the label, neutral.
 */
export function getTaskStatePresentation(statusId: string | undefined): TaskStatePresentation {
  return statusId !== undefined && isTaskStatusId(statusId)
    ? PRESENTATION[statusId]
    : PRESENTATION.blocked;
}

/** A status line for `OperationalRow`'s `supporting`: the status mark with its label `text`. */
export function taskStatusSupporting(
  statusId: string | undefined,
  text: string,
): SemanticSupporting {
  const presentation = getTaskStatePresentation(statusId);

  return {
    text,
    ...(presentation.labelTone ? { tone: presentation.labelTone } : {}),
    ...(presentation.icon ? { icon: presentation.icon } : {}),
    ...(presentation.indicator && !presentation.icon ? { indicator: presentation.indicator } : {}),
    ...(presentation.iconClassName ? { iconClassName: presentation.iconClassName } : {}),
    ...(presentation.textClassName ? { textClassName: presentation.textClassName } : {}),
  };
}
