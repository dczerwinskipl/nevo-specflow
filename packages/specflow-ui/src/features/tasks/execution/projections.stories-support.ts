import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type {
  ExitBlocker,
  GateStatus,
  WorkflowActionProjection,
  WorkflowActor,
} from '@nevo/specflow-contracts/workflow';

type Position = WorkflowActionProjection['position'];
type ActivePosition = Extract<Position, { kind: 'active' }>;

/** A fixture projection whose active position leaves its `exits` to {@link withExits}. */
export type FixtureProjection = Omit<WorkflowActionProjection, 'position'> & {
  readonly position: Exclude<Position, ActivePosition> | Omit<ActivePosition, 'exits'>;
};

/**
 * The projection with the active step's `exits` as the Engine reads them: the finish results
 * without what decides whether one can be taken now. A fixture without `finish` (an agent's
 * attempt) gives its exits itself; those are kept.
 */
export function withExits(projection: FixtureProjection): WorkflowActionProjection {
  const { position } = projection;
  if (position.kind !== 'active') {
    return { ...projection, position };
  }

  const exits = 'exits' in position ? (position as ActivePosition).exits : undefined;

  return {
    ...projection,
    position: {
      ...position,
      exits:
        exits ??
        (projection.actions.finish?.transitions ?? []).map((transition) => ({
          id: transition.id,
          ...(transition.result !== undefined ? { result: transition.result } : {}),
          ...(transition.label !== undefined ? { label: transition.label } : {}),
          target: transition.target,
          ...(transition.targetTitle !== undefined ? { targetTitle: transition.targetTitle } : {}),
          feedback: transition.feedback,
          ...(transition.gates ? { gates: transition.gates } : {}),
        })),
    },
  };
}

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
  | 'first-start'
  | 'on-hold'
  | 'review'
  | 'rework'
  | 'implement-gate'
  | 'review-agent'
  | 'spike-gate'
  | 'spike-gate-met';

/** Why the held Task waits (its hold reason). */
export const HOLD_REASON = 'Waiting for the identity provider sandbox account from IT.';

/** The Task lifecycle actions: a Task that never started (held or not), or one that runs. */
function lifecycle(started: boolean, held = false): NonNullable<WorkflowActionProjection['task']> {
  return {
    approve: unavailable('status'),
    hold: started ? unavailable('active-attempt') : held ? unavailable('status') : allowed,
    resume: held ? allowed : unavailable('status'),
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
  labelDeclared: true,
  documentType: 'findings',
  requiredSections: [],
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
    defaultEntries: [
      { kind: 'task-document', id: 'task', required: true },
      { kind: 'specification-document', id: 'overview', required: true },
    ],
  },
  dependencyCandidates: [],
};

/** A Task's workflow projection in one of the mock's positions. */
export function taskWorkflowProjection(
  scenario: TaskWorkflowScenario,
  options: { readonly version?: number } = {},
): WorkflowActionProjection {
  return withExits(taskFixture(scenario, options));
}

function taskFixture(
  scenario: TaskWorkflowScenario,
  options: { readonly version?: number },
): FixtureProjection {
  const subject = { kind: 'task' as const, specId: SPEC, taskId: TASK };
  if (scenario === 'review-agent') {
    return reviewByAgent();
  }

  if (scenario === 'first-start') {
    const version = options.version ?? buildWorkflow.version;
    const preview = {
      ...buildWorkflow,
      version,
      revision: `rev-build-${version}`,
      firstStep: 'design',
      firstStepTitle: 'Design',
      // Rev 5 adds a security review after the review.
      steps: [
        { id: 'design', title: 'Design', next: ['implement'] },
        { id: 'implement', title: 'Implementation', next: ['review'] },
        {
          id: 'review',
          title: 'Review',
          next: version > 4 ? ['security-review', 'implement'] : ['end', 'implement'],
        },
        ...(version > 4
          ? [{ id: 'security-review', title: 'Security review', next: ['end'] }]
          : []),
      ],
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

  if (scenario === 'on-hold') {
    const preview = {
      ...buildWorkflow,
      firstStep: 'design',
      firstStepTitle: 'Design',
      steps: [
        { id: 'design', title: 'Design', next: ['implement'] },
        { id: 'implement', title: 'Implementation', next: ['review'] },
        { id: 'review', title: 'Review', next: ['end', 'implement'] },
      ],
    };

    return {
      subject,
      workflow: buildWorkflow,
      position: {
        kind: 'blocked',
        blockers: [{ kind: 'status', status: 'on-hold' }],
        preview,
        next: {
          step: step('design', 'Design'),
          human: true,
          agent: unavailable('provider-not-chosen'),
        },
      },
      actions: {},
      task: lifecycle(false, true),
      taskAuthoring,
    };
  }

  if (scenario === 'implement-gate') {
    // The accepted mock's Implement: one exit gate on task.md, its Verification section missing.
    return {
      subject,
      workflow: { ...buildWorkflow, title: 'Standard Task', version: 1, revision: 'rev-std-1' },
      position: {
        kind: 'active',
        step: {
          ...step('implement', 'Implement'),
          purpose: 'Write the code and its tests so the behaviour in task.md works.',
        },
        attempt: { number: 1, startedAt: '2026-11-13T10:24:00Z', actor: dominik },
      },
      actions: {
        finish: {
          step: 'implement',
          attempt: 1,
          transitions: [
            {
              id: 'ready-for-review',
              label: 'Ready for review',
              target: { kind: 'step', step: 'review' },
              targetTitle: 'Review',
              feedback: 'optional',
              unavailable: 'gate-unsatisfied',
              gates: [
                {
                  id: 'verification',
                  type: 'document',
                  label: 'task.md has a Verification section',
                  labelDeclared: true,
                  documentType: 'task',
                  requiredSections: ['Verification'],
                  scope: { kind: 'task', specId: SPEC, taskId: TASK },
                  status: 'unsatisfied',
                  documentId: 'task',
                  reason: 'sections-missing',
                  missingSections: ['Verification'],
                },
              ],
            },
          ],
        },
        return: { targets: [{ step: 'design', title: 'Design', feedback: 'required' }] },
      },
      task: lifecycle(true),
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

/**
 * Review run by an agent: the viewer has no Finish step, but Now still says what finishes it. Its
 * exit gate applies only to Approved (`when: [approved]`); Changes requested needs none. The only
 * return goes to Review itself (start it again).
 */
function reviewByAgent(): WorkflowActionProjection {
  const subject = { kind: 'task' as const, specId: SPEC, taskId: TASK };

  return {
    subject,
    workflow: buildWorkflow,
    position: {
      kind: 'active',
      step: {
        ...step('review', 'Review'),
        purpose: 'Check the change against task.md and record what was verified.',
      },
      attempt: {
        number: 1,
        startedAt: '2026-11-13T10:20:00Z',
        actor: { class: 'agent', details: { provider: 'claude', model: 'opus' } },
      },
      exits: [
        {
          id: 'approved',
          result: 'approved',
          label: 'Approved',
          target: { kind: 'terminal', outcome: 'completed' },
          feedback: 'optional',
          gates: [
            {
              id: 'review-notes',
              type: 'document',
              label: 'task.md has a Review notes section',
              labelDeclared: true,
              documentType: 'task',
              requiredSections: ['Review notes'],
              scope: { kind: 'task', specId: SPEC, taskId: TASK },
              status: 'unsatisfied',
              documentId: 'task',
              reason: 'sections-missing',
              missingSections: ['Review notes'],
            },
          ],
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
    actions: {
      return: { targets: [{ step: 'review', title: 'Review', feedback: 'required' }] },
    },
    task: lifecycle(true),
    taskAuthoring,
  };
}

/** The Task resource facts that match a projection scenario. */
export function taskResourceFor(scenario: TaskWorkflowScenario): TaskResourceFacts {
  const held = scenario === 'on-hold';
  const started = scenario !== 'first-start' && !held;
  const spike = scenario === 'spike-gate' || scenario === 'spike-gate-met';
  const position: TaskResourceFacts['position'] = started
    ? {
        state: 'active',
        step: spike
          ? 'spike'
          : scenario === 'rework' || scenario === 'implement-gate'
            ? 'implement'
            : 'review',
        attempt: scenario === 'rework' ? 2 : 1,
      }
    : { state: 'not-started' };

  return {
    revision: 'rev-9',
    type: spike ? 'spike' : 'ui',
    status: held ? 'on-hold' : 'ready',
    ...(held
      ? {
          statusChange: {
            source: 'decision' as const,
            at: '2026-11-13T09:00:00Z',
            reason: HOLD_REASON,
          },
        }
      : {}),
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
    facts: {
      preparation: 'ready',
      escalated: false,
      position,
      startable: !started && !held,
      startBlockers: held ? [{ kind: 'status', status: 'on-hold' }] : [],
      definitionChanged: false,
    },
    position,
    definitionChanged: false,
  };
}

export type SpecificationWorkflowScenario =
  'waiting' | 'close-blocked' | 'abandoned' | 'completed' | 'tasks-open';

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

/** The Specification's projection: waiting for its Tasks, or ended (abandoned or completed). */
export function specificationWorkflowProjection(
  scenario: SpecificationWorkflowScenario,
): WorkflowActionProjection {
  if (scenario === 'tasks-open') {
    return withExits(tasksOpenProjection());
  }

  const abandoned = scenario === 'abandoned';
  // Both ended runs are terminal: nothing moves any more and Close is allowed.
  const ended = abandoned || scenario === 'completed';

  return {
    subject: { kind: 'specification', specId: SPEC },
    workflow: specWorkflow,
    position: abandoned
      ? {
          kind: 'terminal',
          outcome: 'abandoned',
          abandonment: { at: '2026-11-13T16:40:00Z', reason: ABANDON_REASON, actor: dominik },
        }
      : scenario === 'completed'
        ? { kind: 'terminal', outcome: 'completed' }
        : {
            kind: 'waiting',
            step: { id: 'wait-for-tasks', title: 'Waiting for tasks', kind: 'wait', purpose: '' },
            blockingTasks: { count: 4, ids: ['t-02', TASK, 't-07', 't-03'] },
            totalTasks: 5,
          },
    ...(ended
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
    actions: ended
      ? {}
      : { return: { targets: [{ step: 'breakdown', title: 'Breakdown', feedback: 'optional' }] } },
    specification: {
      createTask: ended ? unavailable('specification-ended') : allowed,
      taskTypes: [],
      exit: {
        close: ended ? allowed : { kind: 'blocked', blockers: [...closeBlockers] },
        abandon: ended ? unavailable('ended') : allowed,
      },
    },
  };
}

/**
 * Acceptance, the step that completes the Specification, while Tasks are open: its one result is
 * unavailable (`tasks-open`) and names them.
 */
function tasksOpenProjection(): FixtureProjection {
  return {
    subject: { kind: 'specification', specId: SPEC },
    workflow: specWorkflow,
    position: {
      kind: 'active',
      step: { id: 'acceptance', title: 'Acceptance', kind: 'work', purpose: '' },
      attempt: { number: 1, startedAt: '2026-11-14T09:30:00Z', actor: dominik },
    },
    actions: {
      finish: {
        step: 'acceptance',
        attempt: 1,
        transitions: [
          {
            id: 'accepted',
            label: 'Accepted',
            target: { kind: 'terminal', outcome: 'completed' },
            feedback: 'optional',
            unavailable: 'tasks-open',
            openTasks: [
              { taskId: 't-02', cause: 'active' },
              { taskId: TASK, cause: 'waiting' },
            ],
          },
        ],
      },
      return: { targets: [{ step: 'breakdown', title: 'Breakdown', feedback: 'optional' }] },
    },
    specification: {
      createTask: allowed,
      taskTypes: [],
      exit: { close: { kind: 'blocked', blockers: [...closeBlockers] }, abandon: allowed },
    },
  };
}
