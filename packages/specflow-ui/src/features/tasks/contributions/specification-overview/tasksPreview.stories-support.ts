import type { TaskListEntry, TaskOverview } from '@nevo/specflow-contracts/specs/workspace';
import { SPEC } from '../../execution/projections.stories-support';

/*
 * The Overview's Tasks preview as the Runtime delivers it, for the worked examples of the UX
 * contract (A3): each `row` group's first two Tasks in importance order, then `more`; `compact`
 * groups as counts. Shared by the section's stories and tests.
 */

type StatusId = 'ready' | 'in-progress' | 'waiting' | 'on-hold' | 'blocked';

const statusLine: Record<StatusId, TaskListEntry['status']> = {
  ready: { id: 'ready', label: 'Ready', lifecycle: 'pending' },
  'in-progress': { id: 'in-progress', label: 'In progress', lifecycle: 'in_progress' },
  waiting: { id: 'waiting', label: 'Waiting', lifecycle: 'pending' },
  'on-hold': { id: 'on-hold', label: 'On hold', lifecycle: 'blocked' },
  blocked: { id: 'blocked', label: 'Cannot start', lifecycle: 'blocked' },
};

const GROUP_NAMES = {
  'in-progress': 'In progress',
  ready: 'Ready to start',
  'cannot-start': 'Cannot start',
  waiting: 'Waiting',
  'on-hold': 'On hold',
  done: 'Done',
  cancelled: 'Cancelled',
} as const;
type GroupId = keyof typeof GROUP_NAMES;

interface RowOptions {
  readonly waitingFor?: readonly string[];
  readonly holdReason?: string;
  /** The Task holds up these open Tasks (the Engine's `on-hold-blocking`). */
  readonly holdsUp?: readonly string[];
}

/** One Task row of the preview, as the Runtime projects it (the Tasks page row). */
export function previewRow(
  id: string,
  title: string,
  type: string,
  status: StatusId,
  options: RowOptions = {},
): TaskListEntry {
  const attention = options.holdsUp
    ? {
        subject: { kind: 'task' as const, specId: SPEC, taskId: id },
        reason: 'on-hold-blocking' as const,
        actor: 'owner' as const,
        action: 'resume-task' as const,
        secondaryAction: 'cancel-task' as const,
        message: `${id} is on hold and holds up ${options.holdsUp.join(', ')}.`,
        blocks: { taskIds: [...options.holdsUp] },
      }
    : undefined;

  return {
    id,
    title,
    type: { id: type.toLowerCase(), title: type },
    dependsOn: [...(options.waitingFor ?? [])],
    status: statusLine[status],
    facts: {
      preparation: status === 'on-hold' ? 'on-hold' : 'ready',
      escalated: false,
      position:
        status === 'in-progress'
          ? { state: 'active', step: 'implement', attempt: 1 }
          : { state: 'not-started' },
      startable: status === 'ready',
      startBlockers: [],
      ...(options.waitingFor
        ? { dependencyWait: { waitingFor: [...options.waitingFor], unsatisfiable: [] } }
        : {}),
      definitionChanged: false,
      ...(attention ? { attention } : {}),
    },
    ...(options.holdReason ? { holdReason: options.holdReason } : {}),
    ...(attention ? { attention } : {}),
  };
}

/** A `row` group of the preview: its count and its first two Tasks, then `more`. */
function rowGroup(groupId: GroupId, count: number, tasks: readonly TaskListEntry[]) {
  return {
    groupId,
    name: GROUP_NAMES[groupId],
    count,
    tasks: tasks.slice(0, 2),
    more: count - Math.min(2, tasks.length),
  };
}

function compactGroup(groupId: GroupId, count: number) {
  return { groupId, name: GROUP_NAMES[groupId], count };
}

const r = previewRow;
const hold = 'Waiting for the identity provider sandbox account from IT.';

/** The worked examples of the contract (A3), by their Task count. */
export const tasksPreviewFixtures = {
  /** 1 in progress, 1 waiting for it, 1 on hold that nothing waits on (not attention). */
  three: {
    rows: [
      rowGroup('in-progress', 1, [
        r(
          'oidc-callback',
          'OIDC callback endpoint and session issue',
          'Implementation',
          'in-progress',
        ),
      ]),
      rowGroup('waiting', 1, [
        r('session-refresh', 'Refresh the session before it expires', 'Implementation', 'waiting', {
          waitingFor: ['oidc-callback'],
        }),
      ]),
      rowGroup('on-hold', 1, [
        r('sign-in-screen', 'Sign-in screen with the SSO button', 'UI implementation', 'on-hold', {
          holdReason: hold,
        }),
      ]),
    ],
    compact: [],
  },
  /** Just after the breakdown is approved: 3 ready, 4 waiting. */
  seven: {
    rows: [
      rowGroup('ready', 3, [
        r('T-01', 'Evaluate identity provider SDKs', 'Spike', 'ready'),
        r('T-02', 'Token exchange endpoint and session cookie', 'Backend', 'ready'),
      ]),
      rowGroup('waiting', 4, [
        r('T-04', 'Sign-in button and provider redirect', 'UI', 'waiting', {
          waitingFor: ['T-02'],
        }),
        r('T-05', 'Return users to where they were', 'UI', 'waiting', { waitingFor: ['T-04'] }),
      ]),
    ],
    compact: [],
  },
  /** 25 Tasks: a held Task that two Tasks wait on comes first in On hold, with its overlay. */
  twentyFive: {
    rows: [
      rowGroup('in-progress', 4, [
        r('T-02', 'Token exchange endpoint and session cookie', 'Backend', 'in-progress'),
        r('T-03', 'Audit log of sign-in events', 'Backend', 'in-progress'),
      ]),
      rowGroup('ready', 3, [
        r('T-08', 'Logout everywhere', 'Backend', 'ready'),
        r('T-09', 'Ekran logowania z przyciskiem SSO i komunikatami błędów', 'UI', 'ready'),
      ]),
      rowGroup('cannot-start', 1, [r('T-11', 'Rate-limit session refresh', 'Backend', 'blocked')]),
      rowGroup('waiting', 5, [
        r('T-12', 'Sign-in button and provider redirect', 'UI', 'waiting', {
          waitingFor: ['T-07'],
        }),
        r('T-13', 'Return users to where they were', 'UI', 'waiting', { waitingFor: ['T-07'] }),
      ]),
      rowGroup('on-hold', 1, [
        r('T-07', 'Identity provider sandbox tenant', 'Infrastructure', 'on-hold', {
          holdReason: hold,
          holdsUp: ['T-12', 'T-13'],
        }),
      ]),
    ],
    compact: [compactGroup('done', 10), compactGroup('cancelled', 1)],
  },
} satisfies Record<string, TaskOverview>;

export type TasksPreviewFixture = keyof typeof tasksPreviewFixtures;
