import { createHash } from 'node:crypto';

import type {
  AttemptRecord,
  ExecutionCatalogue,
  ExecutionInspection,
  ExecutionReading,
  TaskLane,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  WorkflowTransition,
} from '@nevo/specflow-engine';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';

import type {
  Availability,
  AttemptIdentity,
  ExecutionFacts,
  HistoryFacts,
  StepFacts,
  TaskDefinitionFacts,
  TaskIdentity,
  TransitionDestination,
  TransitionFacts,
} from '../reads/facts';

/**
 * Pure projection of one Engine inspection (`inspectExecution`) into the Task read facts. Every
 * fact of one projection comes from that one inspection, so position, transitions and the latest
 * hand-off never mix two reads. The run is interpreted only with the definition it is pinned to:
 * when that definition changed (or is gone), there is no execution or history projection.
 */

export type InspectedTask = ExecutionInspection['tasks'][number];

/** What the projection needs besides the inspection: the Specification it read and the catalogue. */
export interface InspectionBasis {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly specificationTitle: string;
  readonly catalogue: ExecutionCatalogue;
  readonly inspection: ExecutionInspection;
  /** The one Engine read the inspection is part of (same snapshot). */
  readonly reading: ExecutionReading;
}

export function findInspectedTask(
  inspection: ExecutionInspection,
  taskId: string,
): InspectedTask | undefined {
  return inspection.tasks.find((entry) => entry.record.taskId === taskId);
}

export function identityOf(basis: InspectionBasis, taskId: string): TaskIdentity {
  return {
    projectId: basis.projectId,
    workspaceId: basis.workspaceId,
    specId: basis.inspection.specId,
    taskId,
  };
}

const STATUS_OF_LANE: Readonly<Record<TaskLane, TaskDefinitionFacts['task']['status']>> = {
  'needs-approval': { id: 'draft', label: 'Draft', lifecycle: 'pending' },
  'in-progress': { id: 'in-progress', label: 'In progress', lifecycle: 'in_progress' },
  ready: { id: 'ready', label: 'Ready', lifecycle: 'pending' },
  waiting: { id: 'waiting', label: 'Waiting', lifecycle: 'pending' },
  blocked: { id: 'blocked', label: 'Blocked', lifecycle: 'blocked' },
  done: { id: 'completed', label: 'Completed', lifecycle: 'completed' },
  ended: { id: 'abandoned', label: 'Abandoned', lifecycle: 'blocked' },
  held: { id: 'on-hold', label: 'On hold', lifecycle: 'blocked' },
  cancelled: { id: 'cancelled', label: 'Cancelled', lifecycle: 'blocked' },
  broken: { id: 'broken', label: 'Broken', lifecycle: 'blocked' },
};

/** The status line of a Task: the presentation of its Engine lane (`readExecution`). */
export function taskStatusOf(lane: TaskLane): TaskDefinitionFacts['task']['status'] {
  return { ...STATUS_OF_LANE[lane] };
}

/** The Engine lane of a Task the reading covers. */
export function laneOf(basis: InspectionBasis, taskId: string): TaskLane {
  const lane = basis.reading.lanes.get(taskId);
  if (!lane) {
    throw new Error(`The reading has no lane for the Task "${taskId}".`);
  }

  return lane;
}

/** The workflow a Task runs: the pinned one once it started, else its task type's. */
export function workflowOf(
  catalogue: ExecutionCatalogue,
  entry: InspectedTask,
): WorkflowDefinition | undefined {
  if (entry.definitionChanged) {
    return undefined;
  }

  // The inspection compared the pin with the loaded definition (`definitionChanged`).
  const run = entry.record.run;
  if (run) {
    return catalogue.workflow(run.workflow.id);
  }

  const type = catalogue.taskType(entry.record.type);

  return type ? catalogue.workflow(type.workflow) : undefined;
}

export function resourceFactsOf(entry: InspectedTask, lane: TaskLane): TaskResourceFacts {
  const { record } = entry;

  return {
    revision: entry.revision,
    type: record.type,
    status: record.status,
    ...(record.statusChange ? { statusChange: structuredClone(record.statusChange) } : {}),
    dependsOn: [...record.dependsOn],
    origin: structuredClone(record.origin),
    documents: record.documents.map((document) => ({ ...document })),
    context: record.context ? structuredClone([...record.context]) : null,
    readiness:
      entry.readiness.kind === 'dependencies'
        ? { kind: 'dependencies', waitingFor: [...entry.readiness.waitingFor] }
        : entry.readiness.kind === 'status'
          ? { kind: 'status', status: entry.readiness.status }
          : { kind: 'ready' },
    lane,
    position: structuredClone(record.run?.position ?? { state: 'not-started' }),
    definitionChanged: entry.definitionChanged === true,
  };
}

export function definitionFactsOf(
  basis: InspectionBasis,
  entry: InspectedTask,
  document: Availability<{ id: string; revision: string } | null>,
): TaskDefinitionFacts {
  const { record } = entry;
  const titles = new Map(
    basis.inspection.tasks.map((candidate) => [candidate.record.taskId, candidate.record.title]),
  );
  const taskType = basis.catalogue.taskType(record.type);
  const workflow = record.run?.workflow.id ?? taskType?.workflow;
  const lane = laneOf(basis, record.taskId);

  return {
    identity: identityOf(basis, record.taskId),
    version: entry.revision,
    specificationTitle: basis.specificationTitle,
    task: { id: record.taskId, title: record.title, status: taskStatusOf(lane) },
    acceptanceCriteria: [],
    ...(workflow !== undefined ? { workflow } : {}),
    summary: record.summary ?? null,
    group: null,
    taskType: { id: record.type, label: taskType?.title ?? record.type },
    document,
    dependencies: record.dependsOn.map((taskId) => ({
      taskId,
      // A dependency that is broken has no readable title; its id stands in.
      title: titles.get(taskId) ?? taskId,
      link: {
        state: 'available',
        target: { kind: 'task', specId: basis.inspection.specId, taskId },
      },
    })),
    resource: resourceFactsOf(entry, lane),
  };
}

function stepFacts(step: WorkflowStep): StepFacts {
  return {
    id: step.id,
    executors: step.kind === 'work' ? [...step.executors] : [],
    purpose: step.purpose || null,
    expectedWork: null,
    hints: [],
  };
}

function destination(
  definition: WorkflowDefinition,
  transition: WorkflowTransition,
): TransitionDestination | undefined {
  if (transition.target.kind === 'terminal') {
    return {
      kind: 'terminal',
      status: transition.target.outcome,
      outcome: transition.target.outcome === 'completed' ? 'success' : 'failure',
    };
  }

  const target = transition.target.step;
  const step = definition.steps.find((candidate) => candidate.id === target);

  return step ? { kind: 'step', step: stepFacts(step) } : undefined;
}

function transitionFacts(
  definition: WorkflowDefinition,
  transition: WorkflowTransition,
): TransitionFacts | undefined {
  const target = destination(definition, transition);

  return target
    ? {
        id: transition.id,
        ...(transition.result !== undefined ? { result: transition.result } : {}),
        ...(transition.label !== undefined ? { label: transition.label } : {}),
        feedbackRequired: transition.feedback === 'required',
        target,
      }
    : undefined;
}

function transitionsOf(definition: WorkflowDefinition, step: WorkflowStep): TransitionFacts[] {
  return step.transitions.flatMap((transition) => {
    const facts = transitionFacts(definition, transition);

    return facts ? [facts] : [];
  });
}

/** The version of a Task's execution: its run (or none) and the definition it is read with. */
export function executionVersion(entry: InspectedTask, definition: WorkflowDefinition): string {
  return createHash('sha256')
    .update(
      JSON.stringify([entry.revision, definition.id, definition.version, entry.record.run ?? null]),
    )
    .digest('hex');
}

/** Who worked on an attempt, as the read facts name them (a person by the recorded actor id). */
function actorOf(record: AttemptRecord): HistoryFacts['actor'] {
  return record.actor
    ? {
        class: record.actor.class,
        ...(record.actor.class === 'human' ? { actorId: record.actor.details.actorId } : {}),
      }
    : null;
}

/** The actor of the active attempt, from the run record of the same reading. */
function activeActor(run: WorkflowRun | undefined, step: string, attempt: number) {
  const record = run?.attempts.find(
    (candidate) => candidate.step === step && candidate.attempt === attempt,
  );
  const actor = record && actorOf(record);

  return actor ? { actor } : {};
}

const keyOf = (specId: string, taskId: string, record: AttemptRecord): AttemptIdentity => ({
  specId,
  taskId,
  stepId: record.step,
  attempt: record.attempt,
});

/** The last attempt that ended, by record order. */
function lastEnded(run: WorkflowRun): AttemptRecord | undefined {
  return [...run.attempts]
    .filter((record) => record.outcome !== undefined)
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
}

/**
 * The `work` section facts of a Task. `undefined` when its definition is not the pinned one, or when
 * the run position has no attempt to name (a run abandoned or returned before its first attempt):
 * the transport shape cannot say that without inventing an attempt.
 */
export function executionFactsOf(
  basis: InspectionBasis,
  entry: InspectedTask,
): ExecutionFacts | undefined {
  const definition = workflowOf(basis.catalogue, entry);
  if (!definition) {
    return undefined;
  }

  const { specId, taskId } = entry.record;
  const run = entry.record.run;
  const position = run?.position ?? { state: 'not-started' as const };
  const stepById = (id: string) => definition.steps.find((step) => step.id === id);
  const ended = run ? lastEnded(run) : undefined;
  let projected: ExecutionFacts['workflow']['position'];
  let transitions: TransitionFacts[] = [];
  if (position.state === 'not-started') {
    const entryStep = stepById(definition.entryStep);
    projected = { state: 'not_started', next: entryStep ? stepFacts(entryStep) : null };
  } else if (position.state === 'active') {
    const step = stepById(position.step);
    if (!step) {
      return undefined;
    }

    projected = {
      state: 'active',
      key: { specId, taskId, stepId: position.step, attempt: position.attempt },
      step: stepFacts(step),
      semanticStatus: position.step,
      ...activeActor(run, position.step, position.attempt),
    };
    transitions = transitionsOf(definition, step);
  } else if (position.state === 'ready') {
    const step = stepById(position.step);
    if (!step || !ended) {
      return undefined;
    }

    projected = {
      state: 'checkpoint',
      completed: keyOf(specId, taskId, ended),
      next: stepFacts(step),
      nextAttempt: null,
    };
  } else {
    if (!ended) {
      return undefined;
    }

    projected = {
      state: 'terminal',
      completed: keyOf(specId, taskId, ended),
      status: position.outcome,
      outcome: position.outcome === 'completed' ? 'success' : 'failure',
    };
  }

  const handoff = entry.handoff;

  return {
    identity: identityOf(basis, taskId),
    definitionVersion: entry.revision,
    version: executionVersion(entry, definition),
    workflow: {
      definition: {
        id: definition.id,
        title: definition.title,
        description: definition.description || null,
        revision: run?.workflow.revision ?? String(definition.version),
        steps: definition.steps.map((step) => ({
          step: stepFacts(step),
          transitions: transitionsOf(definition, step),
        })),
      },
      position: projected,
      transitions,
      // Start and finish refusals are the action projection's (`GET .../actions`), not this read's.
      blockers: [],
      previousFeedback:
        handoff?.kind === 'transition' && handoff.feedback !== undefined
          ? {
              key: { specId, taskId, stepId: handoff.from.step, attempt: handoff.from.attempt },
              result: handoff.result ?? null,
              text: handoff.feedback,
            }
          : null,
    },
    pendingCount: 0,
    recovery: null,
  };
}

/** The attempts of a Task's run, newest first. `undefined` without the pinned definition. */
export function historyFactsOf(
  basis: InspectionBasis,
  entry: InspectedTask,
): { version: string; items: HistoryFacts[] } | undefined {
  const definition = workflowOf(basis.catalogue, entry);
  if (!definition) {
    return undefined;
  }

  const { specId, taskId } = entry.record;
  const attempts = [...(entry.record.run?.attempts ?? [])].sort(
    (left, right) => right.sequence - left.sequence,
  );
  const items: HistoryFacts[] = [];
  for (const record of attempts) {
    const step = definition.steps.find((candidate) => candidate.id === record.step);
    if (!step) {
      return undefined;
    }

    const outcome = record.outcome;
    const transition =
      outcome?.kind === 'transition'
        ? step.transitions.find((candidate) => candidate.id === outcome.transition)
        : undefined;
    const id = `${record.step}-${String(record.attempt)}`;
    items.push({
      id,
      key: keyOf(specId, taskId, record),
      step: stepFacts(step),
      startedAt: record.startedAt,
      completedAt: record.endedAt ?? null,
      result:
        outcome === undefined
          ? null
          : outcome.kind === 'transition'
            ? (outcome.result ?? outcome.transition)
            : outcome.kind,
      transitionedTo: transition ? (destination(definition, transition) ?? null) : null,
      feedback: outcome && outcome.kind !== 'abandoned' ? (outcome.feedback ?? null) : null,
      actor: actorOf(record),
      resources: [],
      provenance: [{ source: 'workflow_history', sourceId: id }],
    });
  }

  return { version: executionVersion(entry, definition), items };
}
