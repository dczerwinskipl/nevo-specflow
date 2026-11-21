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

  return [providerFallbackName(actor.details.provider), actor.details.model]
    .filter(Boolean)
    .join(' · ');
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

/**
 * A span of time as the history shows it: "Nov 13, 12:52 PM – 1:15 PM" (the end carries its date
 * only when it is another day).
 */
export function formatRange(t: TFunction, from: string, to: string, locale: string): string {
  const start = formatWhen(t, from, locale);
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return start;
  }

  const end = sameDay(a, b)
    ? new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(b)
    : formatWhen(t, to, locale);

  return `${start} – ${end}`;
}

/** An agent provider's name when the Sessions list does not give its title: `claude` is "Claude". */
export function providerFallbackName(provider: string): string {
  return humanizeId(provider);
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

/** The step the position is about: the current step, else the one that starts next. */
function positionStep(position: WorkflowActionProjection['position']) {
  return position.kind === 'active' ||
    position.kind === 'waiting' ||
    position.kind === 'awaiting-confirmation'
    ? position.step
    : position.kind === 'terminal'
      ? undefined
      : position.next?.step;
}

/** What the step at the position does: the current step's purpose, else the next one's. */
export function stepPurpose(position: WorkflowActionProjection['position']): string | undefined {
  const step = positionStep(position);

  // An empty purpose says nothing.
  return step?.purpose === '' ? undefined : step?.purpose;
}

/**
 * A Task Now's Goal: the step's purpose; without one, the first paragraph of its instructions
 * (`more` is the full text when there is more to read). None when the step says neither.
 */
export function stepGoal(
  position: WorkflowActionProjection['position'],
): { readonly text: string; readonly more?: string } | undefined {
  const purpose = stepPurpose(position);
  if (purpose !== undefined) {
    return { text: purpose };
  }

  const instructions = positionStep(position)?.instructions?.trim();
  if (!instructions) {
    return undefined;
  }

  const first = instructions.split(/\n\s*\n/)[0]!.trim();

  return first === instructions ? { text: first } : { text: first, more: instructions };
}

/** One "Done when" list: the gates a result needs, named by the result when results differ. */
export interface DoneWhenGroup {
  /** The result these gates are for, when another result needs other gates. */
  readonly result?: string;
  readonly gates: readonly GateStatus[];
}

/** The Now's "Done when": the active step's exit gates and, for a Task, where the work goes next. */
export interface DoneWhen {
  readonly groups: readonly DoneWhenGroup[];
  /** The step the finished work goes to ("Then: Review"), when every result leads there. */
  readonly then?: string;
}

const gateKey = (gates: readonly GateStatus[]) =>
  gates
    .map((gate) => gate.id)
    .sort()
    .join('\n');

/**
 * What finishes the active step, from the step's results (`position.exits`, read whoever runs the
 * attempt; never a step id): every exit gate, met or not, once when all results need the same
 * gates, else per result that needs any. A result the finish says waits for open Tasks is left out
 * (Now names those Tasks; meeting its gates would not help). `withThen` adds the step all results
 * lead to (a Task's Now; the Specification's track says it).
 */
export function doneWhen(
  projection: Pick<WorkflowActionProjection, 'position' | 'actions'>,
  options: { readonly withThen?: boolean } = {},
): DoneWhen | undefined {
  const { position } = projection;
  if (position.kind !== 'active') {
    return undefined;
  }

  const waiting = new Set(
    (projection.actions.finish?.transitions ?? [])
      .filter((transition) => transition.unavailable === 'tasks-open')
      .map((transition) => transition.id),
  );
  const transitions = position.exits.filter((exit) => !waiting.has(exit.id));
  const gated = transitions.filter((transition) => (transition.gates ?? []).length > 0);
  const sameGates =
    gated.length === transitions.length &&
    new Set(gated.map((transition) => gateKey(transition.gates ?? []))).size <= 1;
  const groups: DoneWhenGroup[] = sameGates
    ? gated.slice(0, 1).map((transition) => ({ gates: transition.gates ?? [] }))
    : gated.map((transition) => ({
        result: transitionLabel(transition),
        gates: transition.gates ?? [],
      }));
  // Every result leads to the same step: that step is where the work goes.
  const first = transitions[0];
  const target = first?.target.kind === 'step' ? first.target.step : undefined;
  const then =
    options.withThen &&
    target !== undefined &&
    transitions.every(
      (transition) => transition.target.kind === 'step' && transition.target.step === target,
    )
      ? first?.targetTitle
      : undefined;
  if (groups.length === 0 && then === undefined) {
    return undefined;
  }

  return { groups, ...(then !== undefined ? { then } : {}) };
}

/**
 * The fix of an unmet document gate whose document exists: "Open behaviour.md" and, when sections
 * are missing, what to add to finish. Shared by the Specification and the Task Now.
 */
export function documentGateFix(
  t: TFunction,
  gate: GateStatus,
  name: string,
): { readonly label: string; readonly hint?: string } {
  const sections =
    gate.status === 'unsatisfied' && gate.reason === 'sections-missing'
      ? (gate.missingSections ?? [])
      : [];

  return {
    label: t('workflowExecution.now.openDocument', { name }),
    ...(sections.length > 0
      ? {
          hint: t('workflowExecution.now.addSectionsToFinish', {
            count: sections.length,
            sections: sections.join(', '),
            name,
          }),
        }
      : {}),
  };
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
 * A button-styled secondary action of the Overview's Now: Finish step beside an unmet gate's action,
 * New task, or the action of an unmet exit gate.
 */
export type NowSecondary =
  | { readonly kind: 'finish' }
  | { readonly kind: 'new-task' }
  | { readonly kind: 'gate'; readonly gate: GateStatus };

/** What the Overview's Now offers beside (or instead of) its main action. */
export interface NowActionPlan {
  /** The one button-styled secondary action, if any. */
  readonly secondary?: NowSecondary;
  /**
   * New task when it is not the secondary: `primary` when Now has no main action (it is then the
   * only action), `quiet` (a ghost button, one tap) beside an unmet gate's action and Finish step.
   */
  readonly newTask?: 'primary' | 'quiet';
}

/**
 * The actions around the Overview Now's main action, from projection facts only (never a step id).
 * New task is offered at an active step that produces Tasks while a Task may be created, and it is
 * never dropped:
 * - main `finish`: New task is the secondary; at another step, an unmet exit gate's action is;
 * - main `gate` (Open behaviour.md): Finish step is the secondary, New task stays as a quiet button;
 * - main `none` (Finish step is unavailable): New task is the only action, primary-styled;
 * - main `start` or `other` (a lifecycle or Close action), or no active step: nothing.
 */
export function nowActionPlan(
  projection: Pick<WorkflowActionProjection, 'position' | 'actions' | 'specification'>,
  main: 'start' | 'finish' | 'gate' | 'other' | 'none',
  hasGateAction: (gate: GateStatus) => boolean,
): NowActionPlan {
  const { position, actions, specification } = projection;
  const newTask =
    position.kind === 'active' &&
    position.step.produces === 'tasks' &&
    specification?.createTask.kind === 'allowed';

  switch (main) {
    case 'gate':
      return { secondary: { kind: 'finish' }, ...(newTask ? { newTask: 'quiet' as const } : {}) };
    case 'none':
      return newTask ? { newTask: 'primary' } : {};
    case 'finish': {
      if (newTask) {
        return { secondary: { kind: 'new-task' } };
      }

      const gate = (actions.finish?.transitions ?? [])
        .filter((transition) => transition.unavailable !== 'tasks-open')
        .flatMap((transition) => transition.gates ?? [])
        .find((candidate) => candidate.status === 'unsatisfied' && hasGateAction(candidate));

      return gate && position.kind === 'active' ? { secondary: { kind: 'gate', gate } } : {};
    }

    default:
      return {};
  }
}
