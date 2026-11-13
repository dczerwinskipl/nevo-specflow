import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type {
  ExitBlocker,
  GateStatus,
  WorkflowActionProjection,
  WorkflowActor,
} from '@nevo/specflow-contracts/workflow';

/*
 * Workflow projections of the accepted mock's scenarios (Single sign-on), as the Runtime delivers
 * them: shared by the production stories and the component tests of manual workflow execution.
 */

export const SPEC = 'sso';
export const TASK = 't-04';

const allowed = { kind: 'allowed' } as const;
const unavailable = <Reason extends string>(reason: Reason) =>
  ({ kind: 'unavailable', reason }) as const;

export const dominik: WorkflowActor = {
  class: 'human',
  details: { actorId: 'local:dominik', trust: 'local' },
};

type Step = Extract<WorkflowActionProjection['position'], { kind: 'active' }>['step'];

const step = (id: string, title: string): Step => ({
  id,
  title,
  kind: 'work',
  purpose: `${title} of the change.`,
  executors: ['agent', 'human'],
});

export const buildWorkflow = {
  workflowId: 'build',
  version: 4,
  revision: 'rev-build-4',
  title: 'Build and review',
};

export type TaskWorkflowScenario =
  'first-start' | 'review' | 'rework' | 'spike-gate' | 'spike-gate-met';

/** The Task lifecycle actions: a Task that never started, or one with an active attempt. */
function lifecycle(started: boolean): NonNullable<WorkflowActionProjection['task']> {
  return {
    approve: unavailable('status'),
    hold: started ? unavailable('active-attempt') : allowed,
    resume: unavailable('status'),
    cancel: allowed,
    remove: started ? unavailable('started') : allowed,
    editDetails: allowed,
    editContext: allowed,
    editDependencies: started ? unavailable('started') : allowed,
  };
}

const findingsGate = (met: boolean): GateStatus => ({
  id: 'findings',
  type: 'document',
  label: 'A findings document',
  documentType: 'findings',
  scope: { kind: 'task', specId: SPEC, taskId: TASK },
  status: met ? 'satisfied' : 'unsatisfied',
  ...(met ? { documentId: 'findings' } : { reason: 'no-document' as const }),
});

const taskAuthoring: NonNullable<WorkflowActionProjection['taskAuthoring']> = {
  context: {
    isDefault: false,
    entries: [
      { entry: { kind: 'task-document', id: 'task', required: true }, state: 'resolved' },
      {
        entry: { kind: 'specification-document', id: 'overview', required: true },
        state: 'resolved',
      },
    ],
  },
  dependencyCandidates: [],
};

/** A Task's workflow projection in one of the mock's positions. */
export function taskWorkflowProjection(
  scenario: TaskWorkflowScenario,
  options: { readonly version?: number } = {},
): WorkflowActionProjection {
  const subject = { kind: 'task' as const, specId: SPEC, taskId: TASK };
  if (scenario === 'first-start') {
    const version = options.version ?? buildWorkflow.version;
    const preview = {
      ...buildWorkflow,
      version,
      revision: `rev-build-${version}`,
      firstStep: 'design',
      firstStepTitle: 'Design',
    };

    return {
      subject,
      workflow: { ...buildWorkflow, version, revision: preview.revision },
      position: {
        kind: 'not-started',
        preview,
        next: {
          step: step('design', 'Design'),
          human: true,
          agent: unavailable('provider-not-chosen'),
        },
      },
      actions: {
        start: { step: 'design', firstStart: true, expectedWorkflowRevision: preview.revision },
      },
      task: lifecycle(false),
      taskAuthoring,
    };
  }

  if (scenario === 'spike-gate' || scenario === 'spike-gate-met') {
    const met = scenario === 'spike-gate-met';

    return {
      subject,
      workflow: {
        workflowId: 'research',
        version: 2,
        revision: 'rev-research-2',
        title: 'Research',
      },
      position: {
        kind: 'active',
        step: step('spike', 'Spike'),
        attempt: { number: 1, startedAt: '2026-11-13T09:05:00Z', actor: dominik },
      },
      actions: {
        finish: {
          step: 'spike',
          attempt: 1,
          transitions: [
            {
              id: 'done',
              result: 'done',
              label: 'Done',
              target: { kind: 'terminal', outcome: 'completed' },
              feedback: 'optional',
              gates: [findingsGate(met)],
              ...(met ? {} : { unavailable: 'gate-unsatisfied' as const }),
            },
            {
              id: 'not-worth',
              result: 'not-worth',
              label: 'Not worth pursuing',
              target: { kind: 'terminal', outcome: 'completed' },
              feedback: 'required',
            },
          ],
        },
      },
      task: lifecycle(true),
      taskAuthoring,
    };
  }

  const rework = scenario === 'rework';
  const current = rework ? step('implement', 'Implementation') : step('review', 'Review');

  return {
    subject,
    workflow: buildWorkflow,
    position: {
      kind: 'active',
      step: current,
      attempt: {
        number: rework ? 2 : 1,
        startedAt: rework ? '2026-11-13T11:52:00Z' : '2026-11-13T10:20:00Z',
        actor: dominik,
      },
    },
    handoff: rework
      ? {
          kind: 'transition',
          from: {
            step: 'review',
            attempt: 1,
            title: 'Review',
            at: '2026-11-13T11:40:00Z',
            actor: dominik,
          },
          transition: 'changes-requested',
          label: 'Changes requested',
          result: 'changes-requested',
          feedback:
            'The refresh path drops the original return URL when the cookie expires mid-request. Keep it in the state parameter and add a test for the expiry case.',
          artifacts: [],
        }
      : {
          kind: 'transition',
          from: {
            step: 'implement',
            attempt: 1,
            title: 'Implementation',
            at: '2026-11-13T10:15:00Z',
            actor: dominik,
          },
          transition: 'ready-for-review',
          label: 'Ready for review',
          feedback: 'Endpoint, cookie and refresh are in place.',
          artifacts: ['screens.md'],
        },
    actions: {
      finish: {
        step: current.id,
        attempt: rework ? 2 : 1,
        transitions: rework
          ? [
              {
                id: 'ready-for-review',
                label: 'Ready for review',
                target: { kind: 'step', step: 'review' },
                targetTitle: 'Review',
                feedback: 'optional',
              },
            ]
          : [
              {
                id: 'approved',
                result: 'approved',
                label: 'Approved',
                target: { kind: 'terminal', outcome: 'completed' },
                feedback: 'optional',
              },
              {
                id: 'changes-requested',
                result: 'changes-requested',
                label: 'Changes requested',
                target: { kind: 'step', step: 'implement' },
                targetTitle: 'Implementation',
                feedback: 'required',
              },
            ],
      },
      return: {
        targets: rework
          ? [{ step: 'design', title: 'Design', feedback: 'required' }]
          : [
              { step: 'design', title: 'Design', feedback: 'required' },
              { step: 'implement', title: 'Implementation', feedback: 'required' },
            ],
      },
    },
    task: lifecycle(true),
    taskAuthoring,
  };
}

/** The Task resource facts that match a projection scenario. */
export function taskResourceFor(scenario: TaskWorkflowScenario): TaskResourceFacts {
  const started = scenario !== 'first-start';
  const spike = scenario === 'spike-gate' || scenario === 'spike-gate-met';

  return {
    revision: 'rev-9',
    type: spike ? 'spike' : 'ui',
    status: 'ready',
    dependsOn: [],
    origin: { kind: 'manual', actorId: 'local:dominik' },
    documents: [
      { id: 'task', path: 'task.md', type: 'task' },
      { id: 'screens', path: 'screens.md', type: 'notes' },
      ...(scenario === 'spike-gate-met'
        ? [{ id: 'findings', path: 'findings.md', type: 'findings' }]
        : []),
    ],
    context: null,
    readiness: { kind: 'ready' },
    lane: started ? 'in-progress' : 'ready',
    position: started
      ? {
          state: 'active',
          step: spike ? 'spike' : scenario === 'rework' ? 'implement' : 'review',
          attempt: scenario === 'rework' ? 2 : 1,
        }
      : { state: 'not-started' },
    definitionChanged: false,
  };
}

export type SpecificationWorkflowScenario = 'waiting' | 'close-blocked' | 'abandoned';

const specWorkflow = {
  workflowId: 'feature',
  version: 3,
  revision: 'rev-feature-3',
  title: 'Feature specification',
};

export const closeBlockers: readonly ExitBlocker[] = [
  { kind: 'specification-run', subjectIds: [SPEC], message: 'display only' },
  {
    kind: 'unfinished-tasks',
    subjectIds: ['t-02', TASK, 't-07', 't-03'],
    message: 'display only',
  },
  { kind: 'pending-task-documents', subjectIds: ['t-02'], message: 'display only' },
];

export const ABANDON_REASON =
  'The provider contract was cancelled; single sign-on moves to next quarter.';

/** The Specification's projection: waiting for its Tasks, or abandoned. */
export function specificationWorkflowProjection(
  scenario: SpecificationWorkflowScenario,
): WorkflowActionProjection {
  const abandoned = scenario === 'abandoned';

  return {
    subject: { kind: 'specification', specId: SPEC },
    workflow: specWorkflow,
    position: abandoned
      ? {
          kind: 'terminal',
          outcome: 'abandoned',
          abandonment: { at: '2026-11-13T16:40:00Z', reason: ABANDON_REASON, actor: dominik },
        }
      : {
          kind: 'waiting',
          step: { id: 'wait-for-tasks', title: 'Waiting for tasks', kind: 'wait', purpose: '' },
          blockingTasks: { count: 4, ids: ['t-02', TASK, 't-07', 't-03'] },
          totalTasks: 5,
        },
    ...(abandoned
      ? {}
      : {
          handoff: {
            kind: 'transition' as const,
            from: {
              step: 'breakdown',
              attempt: 1,
              title: 'Breakdown',
              at: '2026-11-12T15:10:00Z',
              actor: dominik,
            },
            transition: 'tasks-approved',
            label: 'Tasks approved',
            artifacts: [],
          },
        }),
    actions: abandoned
      ? {}
      : { return: { targets: [{ step: 'breakdown', title: 'Breakdown', feedback: 'optional' }] } },
    specification: {
      createTask: abandoned ? unavailable('task-limit') : allowed,
      taskTypes: [],
      exit: {
        close: abandoned ? allowed : { kind: 'blocked', blockers: [...closeBlockers] },
        abandon: abandoned ? unavailable('ended') : allowed,
      },
    },
  };
}
