import type {
  SpecificationWorkspaceResponse,
  TaskListEntry,
  TaskListResponse,
  WorkspaceAttention,
  WorkspaceSession,
  WorkspaceTask,
} from '@nevo/specflow-contracts/specs/workspace';
import type { TaskFacts } from '@nevo/specflow-contracts/tasks';
import type {
  WorkflowActionProjection,
  WorkflowAttentionItem,
} from '@nevo/specflow-contracts/workflow';
import { createWorkspaceIntegrationApi } from '../../../../test-support/specs/workspace/api';
import { SPEC, dominik } from '../execution/projections.stories-support';

/*
 * The Specification control center (Overview and Tasks page) as the Runtime delivers it, in the
 * approved mock's states (Single sign-on): the workspace read, the Specification's workflow
 * projection and the Tasks page read. Shared by the production stories and the component tests.
 */

export type ControlCenterScenario =
  'waiting' | 'blocked' | 'stuck' | 'empty' | 'completed' | 'abandoned' | 'no-task-workflow';

type Status = WorkspaceTask['status'];
type Group =
  | 'needs-approval'
  | 'in-progress'
  | 'ready'
  | 'cannot-start'
  | 'waiting'
  | 'on-hold'
  | 'done'
  | 'cancelled';

interface FixtureTask {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly group: Group;
  readonly status: Status;
  readonly dependsOn?: readonly string[];
  readonly waitingFor?: readonly string[];
  readonly broken?: boolean;
}

const status = {
  draft: { id: 'draft', label: 'Draft', lifecycle: 'pending' },
  ready: { id: 'ready', label: 'Ready', lifecycle: 'pending' },
  inProgress: { id: 'in-progress', label: 'In progress', lifecycle: 'in_progress' },
  waiting: { id: 'waiting', label: 'Waiting', lifecycle: 'pending' },
  blocked: { id: 'blocked', label: 'Cannot start', lifecycle: 'blocked' },
  onHold: { id: 'on-hold', label: 'On hold', lifecycle: 'blocked' },
  completed: { id: 'completed', label: 'Completed', lifecycle: 'completed' },
  cancelled: { id: 'cancelled', label: 'Cancelled', lifecycle: 'blocked' },
  broken: { id: 'broken', label: 'Broken', lifecycle: 'blocked' },
} as const satisfies Record<string, Status>;

const GROUPS: Readonly<
  Record<Group, { name: string; summary: 'row' | 'compact'; collapsed: boolean }>
> = {
  'needs-approval': { name: 'Needs approval', summary: 'row', collapsed: false },
  'in-progress': { name: 'In progress', summary: 'row', collapsed: false },
  ready: { name: 'Ready to start', summary: 'row', collapsed: false },
  'cannot-start': { name: 'Cannot start', summary: 'row', collapsed: false },
  waiting: { name: 'Waiting', summary: 'row', collapsed: false },
  'on-hold': { name: 'On hold', summary: 'row', collapsed: false },
  done: { name: 'Done', summary: 'compact', collapsed: false },
  cancelled: { name: 'Cancelled', summary: 'compact', collapsed: true },
};

const t = (task: FixtureTask) => task;
const T01 = t({
  id: 'T-01',
  title: 'Evaluate identity provider SDKs',
  type: 'Spike',
  group: 'done',
  status: status.completed,
});
const T02 = t({
  id: 'T-02',
  title: 'Token exchange endpoint and session cookie',
  type: 'Backend',
  group: 'in-progress',
  status: status.inProgress,
  dependsOn: ['T-01'],
});
const T03 = t({
  id: 'T-03',
  title: 'Sign-in button and provider redirect',
  type: 'UI',
  group: 'waiting',
  status: status.waiting,
  dependsOn: ['T-02'],
  waitingFor: ['T-02'],
});
const T04 = t({
  id: 'T-04',
  title: 'Return users to where they were',
  type: 'UI',
  group: 'needs-approval',
  status: status.draft,
  dependsOn: ['T-02', 'T-03'],
});
const T05 = t({
  id: 'T-05',
  title: 'Audit log of sign-in events',
  type: 'Backend',
  group: 'on-hold',
  status: status.onHold,
});
const T06 = t({
  id: 'T-06',
  title: 'SAML fallback for legacy tenants',
  type: 'Backend',
  group: 'cancelled',
  status: status.cancelled,
});
const T07 = t({
  id: 'T-07',
  title: 'Rate-limit session refresh',
  type: 'Backend',
  group: 'cannot-start',
  status: status.blocked,
  dependsOn: ['T-04'],
});

const done = (task: FixtureTask): FixtureTask => ({
  ...task,
  group: 'done',
  status: status.completed,
});

function tasksOf(scenario: ControlCenterScenario): readonly FixtureTask[] {
  switch (scenario) {
    case 'waiting':
      return [T01, T02, T03, T04, T05, T06, T07];
    case 'blocked':
      return [
        { ...T04, group: 'ready', status: status.ready },
        { ...T07, status: status.broken, broken: true },
        T05,
      ];
    case 'stuck':
      return [T01, done(T02), done(T03), T04, T05, T06, done(T07)];
    case 'completed':
      return [T01, done(T02), done(T03), done(T04), done(T05), T06, done(T07)];
    case 'abandoned':
      return [
        T01,
        ...[T02, T03, T04, T05, T06, T07].map((task) => ({
          ...task,
          group: 'cancelled' as const,
          status: status.cancelled,
        })),
      ];
    case 'empty':
    case 'no-task-workflow':
      return [];
  }
}

const item = (
  subject: WorkflowAttentionItem['subject'],
  fields: Omit<WorkflowAttentionItem, 'subject' | 'actor'>,
): WorkflowAttentionItem => ({ subject, actor: 'owner', ...fields });
const onTask = (taskId: string) => ({ kind: 'task' as const, specId: SPEC, taskId });

/** The attention projection of the scenario (broken first, then the Specification, then Tasks). */
function attentionOf(scenario: ControlCenterScenario): readonly WorkflowAttentionItem[] {
  switch (scenario) {
    case 'waiting':
      return [
        item(onTask('T-02'), {
          step: 'implement',
          stepTitle: 'Implementation',
          reason: 'owner-action',
          action: 'start-step',
          message: 'Review asked for changes · the next Implementation attempt is yours to start',
        }),
        item(onTask('T-07'), {
          reason: 'context-unresolved',
          action: 'edit-context',
          message: 'Cannot start: its context entry requirements.md › Rate limits no longer exists',
        }),
      ];
    case 'blocked':
      return [
        item(onTask('T-07'), {
          reason: 'task-broken',
          action: 'restore-task',
          message: 'Broken: its files are inconsistent · restore them from Git',
        }),
      ];
    case 'stuck':
      return [
        item(
          { kind: 'specification', specId: SPEC },
          {
            step: 'wait-for-tasks',
            stepTitle: 'Waiting for tasks',
            reason: 'tasks-stuck',
            action: 'review-tasks',
            message:
              'The specification cannot continue until 2 tasks move: T-04 is a draft, T-05 is on hold.',
            taskIds: ['T-04', 'T-05'],
            blocking: [
              { taskId: 'T-04', cause: 'draft' },
              { taskId: 'T-05', cause: 'on-hold' },
            ],
          },
        ),
      ];
    default:
      return [];
  }
}

function workspaceAttentionOf(entry: WorkflowAttentionItem): WorkspaceAttention {
  const common = {
    reason: entry.message,
    code: entry.reason,
    ...(entry.stepTitle ? { stepTitle: entry.stepTitle } : {}),
    actor: entry.actor,
    action: entry.action,
    ...(entry.taskIds ? { taskIds: [...entry.taskIds] } : {}),
    ...(entry.blocking ? { blocking: entry.blocking.map((task) => ({ ...task })) } : {}),
  };
  if (entry.subject.kind === 'task') {
    const { taskId } = entry.subject;
    const broken = entry.reason === 'task-broken';

    return {
      id: `${broken ? 'task-broken' : 'task-attention'}.${taskId}`,
      kind: 'task',
      title:
        [T01, T02, T03, T04, T05, T06, T07].find((task) => task.id === taskId)?.title ?? taskId,
      targetId: taskId,
      priority: broken ? 'critical' : 'normal',
      ...common,
    };
  }

  return {
    id: 'specification-attention',
    kind: 'specification',
    title: entry.stepTitle ?? 'Specification',
    priority: 'normal',
    ...common,
  };
}

/** The Tasks every attention item names (its own, or the Tasks a Specification item covers). */
function namedOf(attention: readonly WorkflowAttentionItem[]): ReadonlySet<string> {
  return new Set(
    attention.flatMap((entry) => [
      ...(entry.subject.kind === 'task' ? [entry.subject.taskId] : []),
      ...(entry.taskIds ?? []),
    ]),
  );
}

function progressOf(tasks: readonly FixtureTask[]) {
  const cancelled = tasks.filter((task) => task.group === 'cancelled').length;

  return {
    completed: tasks.filter((task) => task.group === 'done').length,
    total: tasks.length - cancelled,
    cancelled,
    ended: 0,
    onHold: tasks.filter((task) => task.group === 'on-hold').length,
  };
}

function groupsOf(tasks: readonly FixtureTask[]) {
  return (Object.keys(GROUPS) as Group[]).flatMap((id) => {
    const members = tasks.filter((task) => task.group === id);

    return members.length > 0 ? [{ id, ...GROUPS[id], members }] : [];
  });
}

function facts(task: FixtureTask, attention?: WorkflowAttentionItem): TaskFacts {
  return {
    preparation:
      task.status.id === 'draft'
        ? 'draft'
        : task.status.id === 'on-hold'
          ? 'on-hold'
          : task.status.id === 'cancelled'
            ? 'cancelled'
            : 'ready',
    escalated: false,
    position:
      task.group === 'done'
        ? { state: 'terminal', outcome: 'completed' }
        : task.group === 'in-progress'
          ? { state: 'ready', step: 'implement' }
          : { state: 'not-started' },
    startable: task.group === 'ready',
    startBlockers: [],
    ...(task.waitingFor
      ? { dependencyWait: { waitingFor: [...task.waitingFor], unsatisfiable: [] } }
      : {}),
    definitionChanged: false,
    ...(attention ? { attention } : {}),
  };
}

const sessions = {
  implement: {
    id: 'session-impl',
    title: 'Implement token exchange',
    taskIds: ['T-02'],
    status: 'quiet',
    providerId: 'codex',
    providerTitle: 'Codex',
    updatedAt: '2026-11-14T09:00:00Z',
  },
  draft: {
    id: 'session-spec',
    title: 'Specification draft',
    taskIds: [],
    status: 'quiet',
    providerId: 'claude',
    providerTitle: 'Claude',
    updatedAt: '2026-11-13T15:00:00Z',
  },
  review: {
    id: 'session-review',
    title: 'Review security scenarios',
    taskIds: [],
    status: 'attention',
    providerId: 'claude',
    providerTitle: 'Claude',
    updatedAt: '2026-11-14T09:40:00Z',
  },
} as const satisfies Record<string, WorkspaceSession>;

function sessionsOf(scenario: ControlCenterScenario): readonly WorkspaceSession[] {
  switch (scenario) {
    case 'waiting':
      return [sessions.implement, sessions.draft, sessions.review];
    case 'blocked':
      return [sessions.draft, sessions.review];
    case 'stuck':
      return [sessions.draft];
    case 'no-task-workflow':
      return [sessions.implement];
    default:
      return [];
  }
}

/** The workspace read of the scenario (`sections.tasks.data.overview` included). */
export async function controlCenterWorkspace(
  scenario: ControlCenterScenario,
): Promise<SpecificationWorkspaceResponse> {
  const base = await createWorkspaceIntegrationApi().getSpecificationWorkspace('api-integration');
  const tasks = tasksOf(scenario);
  const attention = attentionOf(scenario);
  const named = namedOf(attention);
  const groups = groupsOf(tasks);
  const sessionItems = sessionsOf(scenario);
  const stuck = attention.find((entry) => entry.reason === 'tasks-stuck');

  return {
    ...base,
    specification: {
      ...base.specification,
      id: SPEC,
      title: 'Single sign-on',
      summary:
        'Employees sign in through the company identity provider and return to the project they had open.',
      preparationState:
        tasks.length === 0
          ? 'empty'
          : tasks.some((task) => task.group === 'needs-approval')
            ? 'preparing'
            : 'prepared',
      attention: [],
    },
    recommendedSessionId: sessionItems[0]?.id,
    sections: {
      ...base.sections,
      documents: {
        state: 'available',
        data: {
          overviewDocumentId: 'specification',
          items: [
            {
              id: 'specification',
              title: 'Specification',
              filename: 'specification.md',
              kind: 'overview',
            },
            {
              id: 'requirements',
              title: 'Requirements',
              filename: 'requirements.md',
              kind: 'requirements',
            },
            { id: 'ux', title: 'UX', filename: 'ux.md', kind: 'ux' },
          ],
        },
      },
      sessions: {
        state: 'available',
        data: {
          items: [...sessionItems],
          attention: sessionItems
            .filter((session) => session.status === 'attention')
            .map((session) => ({
              id: `session-attention.${session.id}`,
              kind: 'session' as const,
              title: session.title ?? session.id,
              reason: 'Asks: keep the return URL in the state parameter?',
              targetId: session.id,
              priority: 'high' as const,
              code: 'session-input',
              actor: 'owner' as const,
              action: 'answer-session' as const,
            })),
        },
      },
      tasks: {
        state: 'available',
        data: {
          groups: groups.map((group) => ({
            id: group.id,
            name: group.name,
            summary: group.summary,
            collapsed: group.collapsed,
            tasks: group.members.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              type: { id: task.type.toLowerCase(), title: task.type },
              dependsOn: [...(task.dependsOn ?? [])],
              ...(named.has(task.id) ? { attention: true } : {}),
            })),
          })),
          ...progressOf(tasks),
          attention: attention.map(workspaceAttentionOf),
          overview: {
            rows: groups
              .filter((group) => group.summary === 'row')
              .map((group) => ({
                groupId: group.id,
                name: group.name,
                count: group.members.length,
                tasks: group.members
                  .slice(0, 2)
                  .map((task) =>
                    named.has(task.id) ? { id: task.id } : { id: task.id, title: task.title },
                  ),
                more: Math.max(0, group.members.length - 2),
              })),
            compact: groups
              .filter((group) => group.summary === 'compact')
              .map((group) => ({
                groupId: group.id,
                name: group.name,
                count: group.members.length,
              })),
            ...(stuck?.blocking
              ? {
                  stuck: stuck.blocking.map((task) => ({
                    ...task,
                    title:
                      tasks.find((candidate) => candidate.id === task.taskId)?.title ?? task.taskId,
                  })),
                }
              : {}),
          },
        },
      },
    },
  };
}

/** The Tasks page read of the scenario; `blocking` keeps the Tasks the `tasks-stuck` names. */
export function controlCenterTaskList(
  scenario: ControlCenterScenario,
  blocking = false,
): TaskListResponse {
  const tasks = tasksOf(scenario);
  const attention = attentionOf(scenario);
  const stuck = attention.find((entry) => entry.reason === 'tasks-stuck');
  const blockingIds = new Set(stuck?.taskIds ?? []);
  const entry = (task: FixtureTask): TaskListEntry => {
    const own = attention.find(
      (candidate) => candidate.subject.kind === 'task' && candidate.subject.taskId === task.id,
    );
    const cause = stuck?.blocking?.find((candidate) => candidate.taskId === task.id)?.cause;
    const blocks = cause ? { blocksSpecification: { cause } } : {};
    if (task.broken) {
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        broken: { reason: 'missing-manifest' },
        ...blocks,
      };
    }

    return {
      id: task.id,
      title: task.title,
      type: { id: task.type.toLowerCase(), title: task.type },
      dependsOn: [...(task.dependsOn ?? [])],
      status: task.status,
      facts: facts(task, own),
      ...blocks,
    };
  };

  const listed = blocking ? tasks.filter((task) => blockingIds.has(task.id)) : tasks;

  return {
    specId: SPEC,
    groups: groupsOf(listed).map((group) => ({
      id: group.id,
      name: group.name,
      summary: group.summary,
      collapsed: group.collapsed,
      tasks: group.members.map(entry),
    })),
    progress: progressOf(tasks),
    attention: [...attention],
    ...(blocking
      ? {
          filter: {
            blocking: 'specification' as const,
            matched: listed.length,
            total: tasks.length,
          },
        }
      : {}),
  };
}

const specWorkflow = {
  workflowId: 'feature-specification',
  version: 3,
  revision: 'rev-spec-3',
  title: 'Feature specification',
};
const smallChange = {
  workflowId: 'small-change',
  version: 1,
  revision: 'rev-small-1',
  title: 'Small change',
};
const allowed = { kind: 'allowed' } as const;
const exit = (closeAllowed: boolean): NonNullable<WorkflowActionProjection['specification']> => ({
  createTask: allowed,
  taskTypes: [],
  exit: {
    close: closeAllowed ? allowed : { kind: 'blocked', blockers: [] },
    abandon: closeAllowed ? { kind: 'unavailable', reason: 'ended' } : allowed,
  },
});
const workStep = (id: string, title: string) => ({
  id,
  title,
  kind: 'work' as const,
  purpose: '',
  executors: ['agent' as const, 'human' as const],
});

/** The Specification's workflow projection of the scenario. */
export function controlCenterProjection(scenario: ControlCenterScenario): WorkflowActionProjection {
  const subject = { kind: 'specification' as const, specId: SPEC };
  switch (scenario) {
    case 'empty':
      return {
        subject,
        workflow: specWorkflow,
        position: {
          kind: 'not-started',
          preview: {
            ...specWorkflow,
            firstStep: 'requirements',
            firstStepTitle: 'Requirements',
            steps: [],
          },
          next: {
            step: workStep('requirements', 'Requirements'),
            human: true,
            agent: { kind: 'unavailable', reason: 'provider-not-chosen' },
          },
        },
        actions: { start: { step: 'requirements', firstStart: false } },
        specification: exit(false),
      };
    case 'blocked':
      return {
        subject,
        workflow: specWorkflow,
        position: {
          kind: 'active',
          step: workStep('specification', 'Specification'),
          attempt: { number: 2, startedAt: '2026-11-14T10:20:00Z', actor: dominik },
        },
        actions: {
          finish: {
            step: 'specification',
            attempt: 2,
            transitions: [
              {
                id: 'specified',
                result: 'specified',
                label: 'Specified',
                target: { kind: 'step', step: 'breakdown' },
                feedback: 'optional',
                unavailable: 'gate-unsatisfied',
                gates: [
                  {
                    id: 'acceptance',
                    type: 'document',
                    label: 'An Acceptance section in specification.md',
                    documentType: 'overview',
                    scope: { kind: 'specification', specId: SPEC },
                    status: 'unsatisfied',
                    documentId: 'specification',
                    reason: 'sections-missing',
                    missingSections: ['Acceptance'],
                  },
                ],
              },
            ],
          },
          return: {
            targets: [{ step: 'requirements', title: 'Requirements', feedback: 'optional' }],
          },
        },
        specification: exit(false),
      };
    case 'completed':
    case 'abandoned':
      return {
        subject,
        workflow: specWorkflow,
        position:
          scenario === 'completed'
            ? { kind: 'terminal', outcome: 'completed' }
            : {
                kind: 'terminal',
                outcome: 'abandoned',
                abandonment: {
                  at: '2026-11-14T16:40:00Z',
                  reason:
                    'The provider contract was cancelled; single sign-on moves to next quarter.',
                  actor: dominik,
                },
              },
        actions: {},
        specification: exit(true),
      };
    case 'no-task-workflow':
      return {
        subject,
        workflow: smallChange,
        position: {
          kind: 'active',
          step: workStep('review', 'Review'),
          attempt: { number: 1, startedAt: '2026-11-14T14:10:00Z', actor: dominik },
        },
        actions: {
          finish: {
            step: 'review',
            attempt: 1,
            transitions: [
              {
                id: 'approved',
                result: 'approved',
                label: 'Approved',
                target: { kind: 'terminal', outcome: 'completed' },
                feedback: 'optional',
              },
            ],
          },
          return: {
            targets: [{ step: 'implementation', title: 'Implementation', feedback: 'required' }],
          },
        },
        specification: exit(false),
      };
    default: {
      const stuck = scenario === 'stuck';

      return {
        subject,
        workflow: specWorkflow,
        position: {
          kind: 'waiting',
          step: { id: 'wait-for-tasks', title: 'Waiting for tasks', kind: 'wait', purpose: '' },
          blockingTasks: stuck
            ? { count: 2, ids: ['T-04', 'T-05'] }
            : { count: 5, ids: ['T-02', 'T-03', 'T-04', 'T-05', 'T-07'] },
          totalTasks: 6,
          ...(stuck
            ? {
                attention: {
                  reason: 'tasks-stuck' as const,
                  taskIds: ['T-04', 'T-05'],
                  blocking: [
                    { taskId: 'T-04', cause: 'draft' as const },
                    { taskId: 'T-05', cause: 'on-hold' as const },
                  ],
                },
              }
            : {}),
        },
        actions: {
          return: { targets: [{ step: 'breakdown', title: 'Breakdown', feedback: 'optional' }] },
        },
        specification: exit(false),
      };
    }
  }
}
