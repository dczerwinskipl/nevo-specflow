import type {
  SpecificationWorkspaceResponse,
  TaskListResponse,
  WorkspaceSession,
} from '@nevo/specflow-contracts/specs/workspace';
import type {
  WorkflowActionProjection,
  WorkflowActor,
  WorkflowOutline,
} from '@nevo/specflow-contracts/workflow';
import { createWorkspaceIntegrationApi } from '../../../../test-support/specs/workspace/api';
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import type { DocumentApi } from '../../documents/api';
import { SPEC } from '../execution/projections.stories-support';

/*
 * The Specification Overview in its early states as the Runtime delivers them: no attention, at
 * most one Session, no Tasks or the first drafts. The data mirrors the dogfooding Specification of
 * GitHub issue #156: the `feature` archetype's documents and the `specification-standard` workflow
 * (.nevo/definitions). Shared by the production stories.
 */

export type EarlyScenario =
  /** Just created: the workflow has not started, every document is still its template. */
  | 'not-started'
  /** Just created, as a real project without Sessions may show it: no goal, Sessions off. */
  | 'not-started-bare'
  /** Gather requirements, the first step, just started. */
  | 'requirements'
  /** Write the Specification by hand: no Session yet, Sessions are offered. */
  | 'write-spec'
  /** Write the Specification with an agent Session working on it. */
  | 'write-spec-session'
  /** Write the Specification, a second attempt after a return from a later step. */
  | 'write-spec-retry'
  /** Write the Specification: behaviour.md still lacks its Acceptance section (an exit gate). */
  | 'write-spec-gate'
  /** Break the solution down, before any Task exists: New task beside Finish step. */
  | 'breakdown'
  /** Break the solution down: the first two draft Tasks were just created. */
  | 'tasks-created'
  /** The wait step: the Tasks are worked on; the step track is compact. */
  | 'waiting'
  /** Write the Specification finished; Design the solution is ready to start. */
  | 'ready'
  /** The workflow completed; both Tasks are done. */
  | 'completed'
  /** The workflow was abandoned at Write the Specification. */
  | 'abandoned';

const notStarted = (scenario: EarlyScenario) =>
  scenario === 'not-started' || scenario === 'not-started-bare';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const owner: WorkflowActor = {
  class: 'human',
  details: { actorId: 'runtime:trusted-local', trust: 'local' },
};

/** The `specification-standard` workflow in declared order, with each step's purpose. */
const steps = [
  {
    id: 'requirements',
    title: 'Gather requirements',
    purpose: 'Agree on the goal, scope, constraints and acceptance with the owner in conversation.',
  },
  {
    id: 'specification',
    title: 'Write the Specification',
    purpose: 'Write the Specification documents from the agreed requirements.',
  },
  { id: 'solution', title: 'Design the solution', purpose: 'Design the solution.' },
  {
    id: 'breakdown',
    title: 'Break the solution down',
    purpose:
      'Draft the Tasks, each with its task type, dependencies and verification; the finish input lists every draft Task.',
  },
  { id: 'breakdown-review', title: 'Review the breakdown', purpose: 'Review the breakdown.' },
  { id: 'implementation', title: 'Implement', purpose: 'The Tasks are implemented.' },
  { id: 'acceptance', title: 'Acceptance', purpose: 'Accept the result.' },
] as const;

const outlineStep = (index: number) => ({
  step: steps[index]!.id,
  title: steps[index]!.title,
  position: index + 1,
});
const tasksStep = outlineStep(3);
/** The Tasks the breakdown created exist from that scenario on. */
const withTasks = (scenario: EarlyScenario): boolean =>
  scenario === 'tasks-created' || scenario === 'waiting' || scenario === 'completed';

const workflow = {
  workflowId: 'specification-standard',
  version: 1,
  revision: 'rev-specification-standard-1',
  title: 'Standard Specification',
};

/** The active step of each started scenario (an index into `steps`). */
const activeIndex: Record<
  Exclude<EarlyScenario, 'not-started' | 'not-started-bare' | 'completed' | 'abandoned'>,
  number
> = {
  requirements: 0,
  ready: 2,
  'write-spec': 1,
  'write-spec-session': 1,
  'write-spec-retry': 1,
  'write-spec-gate': 1,
  breakdown: 3,
  'tasks-created': 3,
  waiting: 5,
};

/** The exit gate of Write the Specification that behaviour.md does not meet yet. */
const acceptanceGate = {
  id: 'behaviour-acceptance',
  type: 'document' as const,
  label: 'behaviour.md has an Acceptance section',
  documentType: 'behaviour',
  scope: { kind: 'specification' as const, specId: SPEC },
  status: 'unsatisfied' as const,
  reason: 'sections-missing' as const,
  missingSections: ['Acceptance'],
  documentId: 'behaviour',
};

/** The Specification's workflow projection of the scenario, with its outline. */
export function earlyProjection(scenario: EarlyScenario): WorkflowActionProjection {
  const subject = { kind: 'specification' as const, specId: SPEC };
  const specification = {
    createTask: { kind: 'allowed' as const },
    taskTypes: [
      {
        id: 'backend',
        title: 'Backend',
        description: 'A change to the Runtime or its APIs.',
        useWhen: 'The work changes server code.',
        workflow: {
          id: 'task-standard',
          title: 'Standard Task',
          steps: [
            { id: 'implement', title: 'Implement' },
            { id: 'review', title: 'Review' },
          ],
        },
      },
    ],
    exit: {
      close: { kind: 'blocked' as const, blockers: [] },
      abandon: { kind: 'allowed' as const },
    },
  };
  const step = (index: number) => ({
    ...steps[index]!,
    kind: 'work' as const,
    executors: ['agent' as const, 'human' as const],
    ...(index === tasksStep.position - 1 ? { produces: 'tasks' as const } : {}),
  });

  if (scenario === 'completed') {
    return {
      subject,
      workflow,
      position: { kind: 'terminal', outcome: 'completed' },
      actions: {},
      specification: {
        ...specification,
        createTask: { kind: 'unavailable', reason: 'specification-ended' },
        exit: { close: { kind: 'allowed' }, abandon: { kind: 'unavailable', reason: 'ended' } },
      },
      outline: { stepCount: steps.length },
    };
  }

  if (scenario === 'abandoned') {
    return {
      subject,
      workflow,
      position: {
        kind: 'terminal',
        outcome: 'abandoned',
        abandonment: {
          at: minutesAgo(12),
          reason: 'The relevance cutoff moved to the search ranking rework.',
          actor: owner,
        },
      },
      actions: {},
      specification: {
        ...specification,
        createTask: { kind: 'unavailable', reason: 'specification-ended' },
        exit: { close: { kind: 'allowed' }, abandon: { kind: 'unavailable', reason: 'ended' } },
      },
      // Once the run ended the outline names no step: the track is not shown.
      outline: { stepCount: steps.length },
    };
  }

  if (notStarted(scenario)) {
    const outline: WorkflowOutline = { stepCount: steps.length, next: outlineStep(0), tasksStep };

    return {
      subject,
      workflow,
      position: {
        kind: 'not-started',
        preview: {
          ...workflow,
          firstStep: steps[0].id,
          firstStepTitle: steps[0].title,
          steps: steps.map((entry, index) => ({
            id: entry.id,
            title: entry.title,
            next: [steps[index + 1]?.id ?? 'end'],
          })),
        },
        next: { step: step(0), human: true, agent: { kind: 'available' } },
      },
      actions: {
        start: { step: steps[0].id, firstStart: true, expectedWorkflowRevision: workflow.revision },
      },
      specification,
      outline,
    };
  }

  const index = activeIndex[scenario];
  const outline: WorkflowOutline = {
    stepCount: steps.length,
    current: outlineStep(index),
    next: outlineStep(index + 1),
    // The steps run in a line: past the producing step the Engine claims no Tasks step.
    ...(index <= tasksStep.position - 1 ? { tasksStep } : {}),
  };

  if (scenario === 'ready') {
    return {
      subject,
      workflow,
      position: {
        kind: 'ready',
        next: { step: step(index), human: true, agent: { kind: 'available' } },
      },
      actions: { start: { step: steps[index]!.id, firstStart: false } },
      specification,
      outline,
    };
  }

  if (scenario === 'waiting') {
    return {
      subject,
      workflow,
      position: {
        kind: 'waiting',
        step: { ...steps[index]!, kind: 'wait' },
        blockingTasks: { count: 2, ids: drafts.map((draft) => draft.id) },
        totalTasks: 2,
      },
      actions: {},
      specification,
      outline,
    };
  }

  const attempt = scenario === 'write-spec-retry' ? 2 : 1;

  return {
    subject,
    workflow,
    position: {
      kind: 'active',
      step: step(index),
      attempt: {
        number: attempt,
        startedAt: minutesAgo(scenario === 'tasks-created' ? 8 : 31),
        actor: owner,
      },
    },
    actions: {
      finish: {
        step: steps[index]!.id,
        attempt,
        transitions: [
          {
            id: 'done',
            target: { kind: 'step', step: steps[index + 1]!.id },
            targetTitle: steps[index + 1]!.title,
            feedback: 'optional',
            ...(scenario === 'write-spec-gate'
              ? { unavailable: 'gate-unsatisfied' as const, gates: [acceptanceGate] }
              : {}),
          },
        ],
      },
    },
    specification,
    outline,
  };
}

const title = 'Docs search: relevance cutoff for vector-only results';
/** The overview's Goal: the Runtime's summary (its first paragraph is "Source: GitHub issue #156."). */
const goal =
  'Hybrid documentation search drops vector-only hits below a calibrated relevance cutoff, so nonsense queries return no results while real queries keep their useful top 10.';

/** The documents of the `feature` archetype; which ones are still only their template. */
function documentsOf(scenario: EarlyScenario) {
  const writing = !notStarted(scenario);
  const doc = (id: string, docTitle: string, written: boolean) => ({
    id,
    title: docTitle,
    filename: `${id}.md`,
    kind: id,
    templateOnly: !(writing && written),
  });

  return [
    doc('overview', 'Overview', true),
    doc('behaviour', 'Behaviour', true),
    doc('ux', 'UX', false),
    doc('backend', 'Backend', true),
    doc('decisions', 'Decisions', false),
  ];
}

/** The Session of step 2; it stays with the Specification after the breakdown created Tasks. */
function sessionsOf(scenario: EarlyScenario): WorkspaceSession[] {
  if (scenario !== 'write-spec-session' && scenario !== 'tasks-created') {
    return [];
  }

  const later = scenario === 'tasks-created';

  return [
    {
      id: 'spec-session',
      title: 'Write the cutoff Specification documents',
      taskIds: [],
      status: later ? 'quiet' : 'active',
      providerId: 'claude',
      providerTitle: 'Claude',
      modelId: 'claude-sonnet-5-5',
      modelTitle: 'Sonnet 5.5',
      updatedAt: minutesAgo(later ? 26 : 1),
    },
  ];
}

/** The two drafts the breakdown proposed. */
const drafts = [
  { id: 'cutoff-calibration', title: 'Calibrate and document the cutoff' },
  { id: 'fusion-cutoff', title: 'Drop vector-only hits below minSimilarity' },
] as const;
const draftStatus = { id: 'draft', label: 'Draft', lifecycle: 'pending' } as const;
const doneStatus = { id: 'completed', label: 'Done', lifecycle: 'completed' } as const;
const inProgressStatus = {
  id: 'in-progress',
  label: 'In progress',
  lifecycle: 'in_progress',
} as const;

/** The workspace read of the scenario. */
export async function earlyWorkspace(
  scenario: EarlyScenario,
): Promise<SpecificationWorkspaceResponse> {
  const base = await createWorkspaceIntegrationApi().getSpecificationWorkspace('api-integration');
  const tasks = withTasks(scenario) ? drafts : [];
  const done = scenario === 'completed';
  const group =
    scenario === 'waiting'
      ? { id: 'in-progress', name: 'In progress', status: inProgressStatus }
      : done
        ? { id: 'done', name: 'Done', status: doneStatus }
        : { id: 'needs-approval', name: 'Needs approval', status: draftStatus };
  const sessions = sessionsOf(scenario);
  const bare = scenario === 'not-started-bare';
  const notImplemented = { state: 'unavailable', reason: 'not_implemented' } as const;

  return {
    ...base,
    recommendedSessionId: sessions[0]?.id,
    specification: {
      ...base.specification,
      id: SPEC,
      title,
      // A project without a written goal has an empty summary (audit finding 14).
      summary: bare ? '' : goal,
      preparationState: tasks.length > 0 ? 'preparing' : 'empty',
      attention: [],
    },
    sections: {
      ...base.sections,
      // A project Runtime does not project Git yet.
      repository: notImplemented,
      changes: notImplemented,
      activity: { state: 'available', data: { items: [] } },
      documents: {
        state: 'available',
        data: { overviewDocumentId: 'overview', items: documentsOf(scenario) },
      },
      // Sessions turned off: no readable registry, with `sessions_disabled` on the action.
      sessions: bare
        ? { state: 'unavailable', reason: 'source_unavailable' }
        : { state: 'available', data: { items: sessions, attention: [] } },
      tasks: {
        state: 'available',
        data: {
          groups:
            tasks.length > 0
              ? [
                  {
                    id: group.id,
                    name: group.name,
                    summary: 'row',
                    collapsed: false,
                    tasks: tasks.map((task) => ({
                      ...task,
                      status: group.status,
                      type: { id: 'backend', title: 'Backend' },
                      dependsOn: [],
                    })),
                  },
                ]
              : [],
          completed: done ? tasks.length : 0,
          total: tasks.length,
          cancelled: 0,
          ended: 0,
          onHold: 0,
          attention: [],
          overview: {
            rows:
              tasks.length > 0
                ? [
                    {
                      groupId: group.id,
                      name: group.name,
                      count: tasks.length,
                      tasks: [...tasks],
                      more: 0,
                    },
                  ]
                : [],
            compact: [],
          },
        },
      },
    },
    actions: {
      startSession: bare ? { available: false, reason: 'sessions_disabled' } : { available: true },
    },
  };
}

/** The Tasks page read of the scenario (the drafts await approval). */
export function earlyTaskList(scenario: EarlyScenario): TaskListResponse {
  const tasks = scenario === 'tasks-created' ? drafts : [];

  return {
    specId: SPEC,
    groups:
      tasks.length > 0
        ? [
            {
              id: 'needs-approval',
              name: 'Needs approval',
              summary: 'row',
              collapsed: false,
              tasks: tasks.map((task) => ({
                ...task,
                type: { id: 'backend', title: 'Backend' },
                dependsOn: [],
                status: draftStatus,
                facts: {
                  preparation: 'draft',
                  escalated: false,
                  position: { state: 'not-started' },
                  startable: false,
                  startBlockers: [],
                  definitionChanged: false,
                },
              })),
            },
          ]
        : [],
    progress: { completed: 0, total: tasks.length, cancelled: 0, ended: 0, onHold: 0 },
    attention: [],
  };
}

/** The document types of the `feature` archetype with their icons (.nevo/definitions). */
export const earlyCatalogue: ArchetypeCatalogue = {
  revision: 'catalogue-early',
  documentTypes: (
    [
      ['overview', 'Overview', 'book-open'],
      ['behaviour', 'Behaviour', 'list-ordered'],
      ['ux', 'UX', 'panels-top-left'],
      ['backend', 'Backend', 'server'],
      ['decisions', 'Decisions', 'file-check'],
    ] as const
  ).map(([id, typeTitle, icon]) => ({
    id,
    title: typeTitle,
    description: `${typeTitle} of the change.`,
    useWhen: 'Always.',
    instructions: 'Fill every section.',
    icon,
  })),
  archetypes: [],
};

/** The overview document as the Secondary preview reads it. */
export const earlyDocumentApi: DocumentApi = {
  getDocument: (_scope, documentId) =>
    Promise.resolve(
      documentContentFixture({
        id: documentId,
        path: `${documentId}.md`,
        title: documentId === 'overview' ? title : documentId,
        type: documentId,
        content:
          documentId === 'overview'
            ? [
                `# ${title}`,
                '',
                'Source: GitHub issue #156.',
                '',
                '## Context',
                '',
                'Hybrid documentation search has no relevance cutoff. The vector side always returns nearest neighbours, so any query fills the top 10.',
                '',
                '## Goal',
                '',
                goal,
                '',
                '## Non-goals',
                '',
                '- Changing the presentation refined in #155.',
                '- Changing lexical ranking or the fusion of word-matched hits.',
                '',
              ].join('\n')
            : `# ${documentId}\n`,
        revision: 'r1',
      }),
    ),
};
