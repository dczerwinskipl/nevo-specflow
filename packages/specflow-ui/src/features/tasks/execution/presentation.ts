import type { TFunction } from 'i18next';
import type {
  GateStatus,
  OpenTask,
  WorkflowActionProjection,
  WorkflowActor,
  WorkflowOutline,
} from '@nevo/specflow-contracts/workflow';
import type { ProgressPosition } from '@nevo/ui';

/** The recorded identity of the trusted local person (no authentication configured). */
const TRUSTED_LOCAL_ACTOR = 'runtime:trusted-local';

/** Who is looking: the session's user id and the actor id the CLI records for this machine's user. */
export interface Viewer {
  readonly userId?: string;
  readonly localActorId?: string;
}

/**
 * A person as recorded (`user:ann`, `local:ann`): "you" for the viewer (their user id, or, without
 * required authentication, the CLI's `local:<os-user>` of this machine) or the trusted local person,
 * else the id without its identity-source prefix (the id itself is shown as it is).
 */
export function personLabel(t: TFunction, actorId: string, viewer: Viewer = {}): string {
  if (
    actorId === TRUSTED_LOCAL_ACTOR ||
    (viewer.userId !== undefined && actorId === `user:${viewer.userId}`) ||
    (viewer.localActorId !== undefined && actorId === viewer.localActorId)
  ) {
    return t('workflowExecution.actor.you');
  }

  return actorId.replace(/^(local|user):/, '');
}

/** Who acted, as recorded: a person by {@link personLabel}, an agent by provider and model. */
export function actorLabel(t: TFunction, actor: WorkflowActor, viewer: Viewer = {}): string {
  if (actor.class === 'human') {
    return personLabel(t, actor.details.actorId, viewer);
  }

  return [actor.details.provider, actor.details.model].filter(Boolean).join(' · ');
}

/** `needs-changes` -> `Needs changes`: the fallback for an id that has no label. */
export function humanizeId(id: string): string {
  const words = id.replace(/[-_.]+/g, ' ').trim();

  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

/** A transition as people read it: its label, its result, else its id made readable. */
export function transitionLabel(transition: {
  readonly id: string;
  readonly label?: string;
  readonly result?: string;
}): string {
  return transition.label ?? transition.result ?? humanizeId(transition.id);
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * A recorded time as people say it: `Today 11:40`, `Yesterday 17:20`, else a short date and time.
 * With `timeOnlyToday`, a time today is just `11:40` (the Now block's running attempt). An
 * unreadable value is shown as it is.
 */
export function formatWhen(
  t: TFunction,
  at: string,
  locale: string,
  options: { readonly now?: Date; readonly timeOnlyToday?: boolean } = {},
): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return at;
  }

  const now = options.now ?? new Date();
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
  if (sameDay(date, now)) {
    return options.timeOnlyToday ? time : t('workflowExecution.time.today', { time });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) {
    return t('workflowExecution.time.yesterday', { time });
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** What an unmet gate is missing, in one clause (`none registered yet`). */
export function gateDetail(t: TFunction, gate: GateStatus): string | undefined {
  if (gate.status === 'satisfied') {
    return undefined;
  }

  switch (gate.reason) {
    case 'no-document':
      return t('workflowExecution.gate.noDocument');
    case 'file-missing':
      return t('workflowExecution.gate.fileMissing');
    case 'sections-missing':
      return t('workflowExecution.gate.sectionsMissing', {
        sections: (gate.missingSections ?? []).join(', '),
      });
    case 'unreadable':
      return t('workflowExecution.gate.unreadable');
    default:
      return undefined;
  }
}

export interface PreviewStep {
  readonly id: string;
  readonly title: string;
  readonly next: readonly string[];
}

/**
 * What changed between the workflow the owner confirmed and the one a start would pin now, one
 * sentence each: added, removed and renamed steps, and steps whose transitions lead elsewhere.
 */
export function workflowChanges(
  t: TFunction,
  before: readonly PreviewStep[],
  after: readonly PreviewStep[],
): string[] {
  const old = new Map(before.map((step) => [step.id, step]));
  const now = new Map(after.map((step) => [step.id, step]));
  const changes: string[] = [];
  after.forEach((step, index) => {
    const previous = old.get(step.id);
    if (!previous) {
      const preceding = after[index - 1]?.title;
      changes.push(
        preceding
          ? t('workflowExecution.change.addedAfter', { step: step.title, after: preceding })
          : t('workflowExecution.change.added', { step: step.title }),
      );
    } else if (previous.title !== step.title) {
      changes.push(t('workflowExecution.change.renamed', { from: previous.title, to: step.title }));
    } else if (previous.next.join() !== step.next.join()) {
      changes.push(t('workflowExecution.change.transitions', { step: step.title }));
    }
  });
  for (const step of before) {
    if (!now.has(step.id)) {
      changes.push(t('workflowExecution.change.removed', { step: step.title }));
    }
  }

  return changes;
}

/**
 * The open Tasks a completion waits for, in running text (`api is in progress, screen waits for
 * other tasks`), with the cause words of the stuck explanation.
 */
export function openTasksText(t: TFunction, tasks: readonly OpenTask[]): string {
  return tasks
    .map((task) => `${task.taskId} ${t(`taskOverview.stuck.cause.${task.cause}`)}`)
    .join(', ');
}

/** What the step at the position does: the current step's purpose, else the next one's. */
export function stepPurpose(position: WorkflowActionProjection['position']): string | undefined {
  const step =
    position.kind === 'active' || position.kind === 'waiting'
      ? position.step
      : position.kind === 'terminal'
        ? undefined
        : position.next?.step;

  // An empty purpose says nothing.
  return step?.purpose === '' ? undefined : step?.purpose;
}

/**
 * Where the run is among the declared steps: "Step 2 of 7 · next: Design the solution", or
 * "Step 7 of 7" at the last one. None before the first start (Now says "First step · …") and once
 * the run ended.
 */
export function progressLine(
  t: TFunction,
  outline: WorkflowOutline | undefined,
): string | undefined {
  const current = outline?.current;
  if (!outline || !current) {
    return undefined;
  }

  return outline.next
    ? t('workflowExecution.now.progressNext', {
        position: current.position,
        total: outline.stepCount,
        next: outline.next.title,
      })
    : t('workflowExecution.now.progress', { position: current.position, total: outline.stepCount });
}

/**
 * The quiet line of a running attempt: "In progress since 11:18 · started by you". The attempt is
 * named only from the second one on ("Attempt 2 · in progress since …"): a first attempt is the
 * normal case and says nothing.
 */
export function attemptLine(
  t: TFunction,
  attempt: { readonly number: number; readonly since: string; readonly actor: string },
): string {
  return attempt.number > 1
    ? t('workflowExecution.now.activeAttempt', {
        attempt: attempt.number,
        since: attempt.since,
        actor: attempt.actor,
      })
    : t('workflowExecution.now.active', { since: attempt.since, actor: attempt.actor });
}

/** The step track of a Specification's Now: the DS Progress position and its two labels. */
export interface StepTrack {
  readonly position: ProgressPosition;
  readonly total: number;
  /** The visible label beside the track ("Step 4 of 7 · next: Review the breakdown"). */
  readonly label: string;
  /** The track's accessible name ("Step 4 of 7: Break the solution down"). */
  readonly ariaLabel: string;
}

/**
 * Where the run sits among its declared steps, from the outline only: at a step, before the first
 * start (the first step outlined) or completed. None without an outline and for an abandoned run
 * (the outline no longer says where it stopped).
 */
export function stepTrack(
  t: TFunction,
  projection: Pick<WorkflowActionProjection, 'outline' | 'position'>,
): StepTrack | undefined {
  const { outline, position } = projection;
  if (!outline || outline.stepCount <= 0) {
    return undefined;
  }

  const total = outline.stepCount;
  if (outline.current) {
    return {
      position: { state: 'current', step: outline.current.position },
      total,
      label: progressLine(t, outline) ?? '',
      ariaLabel: t('workflowExecution.now.track.current', {
        position: outline.current.position,
        total,
        title: outline.current.title,
      }),
    };
  }

  const firstStepTitle =
    position.kind === 'not-started' || position.kind === 'blocked'
      ? position.preview?.firstStepTitle
      : undefined;
  if (firstStepTitle !== undefined) {
    return {
      position: { state: 'not-started' },
      total,
      label: t('workflowExecution.now.firstStep', { title: firstStepTitle }),
      ariaLabel: t('workflowExecution.now.track.notStarted', { total, title: firstStepTitle }),
    };
  }

  if (position.kind === 'terminal' && position.outcome === 'completed') {
    const label = t('workflowExecution.now.track.completed', { total });

    return { position: { state: 'completed' }, total, label, ariaLabel: label };
  }

  return undefined;
}

/**
 * The one contextual secondary action of the Overview's Now, from projection facts only (never a
 * step id):
 * - `finish` when the main action is an unmet gate's (Open behaviour.md): Finish step stays beside
 *   it, and its dialog says what is still missing;
 * - `new-task` at an active step that produces Tasks while a Task may be created;
 * - `gate` for an unmet exit gate that has an action and is not the main action;
 * - none otherwise. Never more than one.
 */
export type NowSecondary =
  | { readonly kind: 'finish' }
  | { readonly kind: 'new-task' }
  | { readonly kind: 'gate'; readonly gate: GateStatus };

export function nowSecondary(
  projection: Pick<WorkflowActionProjection, 'position' | 'actions' | 'specification'>,
  main: 'start' | 'finish' | 'gate' | 'other' | 'none',
  hasGateAction: (gate: GateStatus) => boolean,
): NowSecondary | undefined {
  if (main === 'gate') {
    return { kind: 'finish' };
  }

  const { position, actions, specification } = projection;
  if (position.kind !== 'active' || main === 'other') {
    return undefined;
  }

  if (position.step.produces === 'tasks' && specification?.createTask.kind === 'allowed') {
    return { kind: 'new-task' };
  }

  const gate = (actions.finish?.transitions ?? [])
    .filter((transition) => transition.unavailable !== 'tasks-open')
    .flatMap((transition) => transition.gates ?? [])
    .find((candidate) => candidate.status === 'unsatisfied' && hasGateAction(candidate));

  return gate ? { kind: 'gate', gate } : undefined;
}
