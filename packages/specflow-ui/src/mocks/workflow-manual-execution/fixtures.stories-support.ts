/*
 * PRESENTATION MOCK FIXTURES (design validation for
 * docs/ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md).
 *
 * The workflow view is a stand-in for the proposed read-only Engine action projection (E4a): it
 * says where a subject is and which actions are allowed now. Step ids are user-defined strings and
 * the UI never branches on them; only the projection's `kind`s and allowed actions matter.
 */

export type PreparationStatus = 'draft' | 'ready' | 'on-hold' | 'cancelled';

export interface WorkflowDefinitionRef {
  readonly id: string;
  readonly title: string;
  readonly revision: number;
}

export interface Transition {
  readonly id: string;
  /** The definition's label for the result. */
  readonly label: string;
  /** Target step id, or `null` when the transition ends the workflow. */
  readonly to: string | null;
  readonly feedback: 'required' | 'optional';
}

export interface Handoff {
  readonly fromStep: string;
  readonly attempt: number;
  readonly result: string;
  readonly toStep: string | null;
  readonly feedback?: string;
  readonly actor: string;
  readonly at: string;
  readonly returned?: boolean;
}

export interface Blocker {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly tone?: 'attention' | 'info' | 'neutral';
}

export type WorkflowPosition =
  | { readonly kind: 'not-started'; readonly firstStep: string }
  | { readonly kind: 'ready'; readonly step: string; readonly attempt: number }
  | {
      readonly kind: 'active';
      readonly step: string;
      readonly attempt: number;
      readonly since: string;
      readonly actor: string;
    }
  | {
      readonly kind: 'waiting';
      readonly step: string;
      /** The semantic line: what it waits for. */
      readonly reason: string;
      /** Quiet note: how it continues. */
      readonly note: string;
      readonly blockers: readonly Blocker[];
    }
  | { readonly kind: 'terminal'; readonly summary: string; readonly at: string };

export interface WorkflowView {
  readonly definition: WorkflowDefinitionRef;
  readonly position: WorkflowPosition;
  /** Allowed actions from the projection; absent means not allowed now. */
  readonly canStart?: boolean;
  readonly transitions?: readonly Transition[];
  readonly returnSteps?: readonly string[];
  /** Why there is no action, when that is not obvious from the position. */
  readonly unavailableReason?: string;
  readonly latest?: Handoff;
}

export interface TaskType {
  readonly id: string;
  readonly title: string;
  readonly workflow: WorkflowDefinitionRef;
  readonly steps: readonly string[];
  readonly useWhen: string;
}

export const taskTypes: readonly TaskType[] = [
  {
    id: 'spike',
    title: 'Spike',
    workflow: { id: 'research', title: 'Research', revision: 2 },
    steps: ['spike'],
    useWhen: 'Time-boxed investigation that ends with a written finding.',
  },
  {
    id: 'backend',
    title: 'Backend',
    workflow: { id: 'build-and-review', title: 'Build and review', revision: 4 },
    steps: ['spike', 'implement', 'review'],
    useWhen: 'Server or Engine change, reviewed before it counts as done.',
  },
  {
    id: 'ui',
    title: 'UI',
    workflow: { id: 'ui-build', title: 'UI build', revision: 1 },
    steps: ['implement', 'review', 'ux-acceptance'],
    useWhen: 'Screen or component change with an owner UX acceptance.',
  },
];

export const specification = {
  id: 'single-sign-on',
  title: 'Single sign-on',
  description:
    'Employees sign in through the company identity provider and return to the project they had open.',
  archetype: 'Feature',
  workflow: { id: 'feature-specification', title: 'Feature specification', revision: 3 },
  steps: ['requirements', 'specification', 'breakdown', 'wait-for-tasks'],
} as const;

export interface MockTask {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly type: string;
  readonly status: PreparationStatus;
  readonly dependsOn: readonly string[];
  /** Whether the Task workflow has ever started (a Run exists). */
  readonly started: boolean;
  readonly workflow: WorkflowView;
}

const backend = taskTypes[1]!.workflow;
const ui = taskTypes[2]!.workflow;
const spike = taskTypes[0]!.workflow;

export const reviewFailed: Handoff = {
  fromStep: 'review',
  attempt: 1,
  result: 'Changes requested',
  toStep: 'implement',
  feedback:
    'The refresh path drops the original return URL when the cookie expires mid-request. Keep it in the state parameter and add a test for the expiry case.',
  actor: 'Dominik',
  at: 'Today 11:40',
};

export const tasks: readonly MockTask[] = [
  {
    id: 'T-01',
    title: 'Evaluate identity provider SDKs',
    summary: 'Compare the two SDKs we may use and record the decision.',
    type: 'spike',
    status: 'ready',
    dependsOn: [],
    started: true,
    workflow: {
      definition: spike,
      position: {
        kind: 'terminal',
        summary: 'Finished spike: Recommendation written',
        at: 'Yesterday',
      },
      latest: {
        fromStep: 'spike',
        attempt: 1,
        result: 'Recommendation written',
        toStep: null,
        actor: 'Dominik',
        at: 'Yesterday 16:05',
      },
    },
  },
  {
    id: 'T-02',
    title: 'Token exchange endpoint and session cookie',
    summary:
      'Exchange the provider code for a session, set the cookie and refresh it before expiry.',
    type: 'backend',
    status: 'ready',
    dependsOn: ['T-01'],
    started: true,
    workflow: {
      definition: backend,
      position: { kind: 'active', step: 'implement', attempt: 2, since: '11:52', actor: 'you' },
      transitions: [
        { id: 'ready-for-review', label: 'Ready for review', to: 'review', feedback: 'optional' },
        { id: 'blocked', label: 'Blocked', to: 'spike', feedback: 'required' },
      ],
      returnSteps: ['spike'],
      latest: reviewFailed,
    },
  },
  {
    id: 'T-03',
    title: 'Sign-in button and provider redirect',
    summary: 'Add the sign-in entry and redirect to the provider with the return state.',
    type: 'ui',
    status: 'ready',
    dependsOn: ['T-02'],
    started: false,
    workflow: {
      definition: ui,
      position: {
        kind: 'waiting',
        step: 'implement',
        reason: 'Waiting for 1 dependency',
        note: 'Not started · it becomes ready when its dependencies are done',
        blockers: [
          {
            id: 'T-02',
            title: 'Token exchange endpoint and session cookie',
            state: 'implement · attempt 2 · active',
            tone: 'info',
          },
        ],
      },
    },
  },
  {
    id: 'T-04',
    title:
      'Return users to the project, document and scroll position they had open before the identity provider redirected them away',
    summary: 'Restore the previous route and its view state after a successful sign-in.',
    type: 'ui',
    status: 'draft',
    dependsOn: ['T-02', 'T-03'],
    started: false,
    workflow: {
      definition: ui,
      position: { kind: 'not-started', firstStep: 'implement' },
      unavailableReason: 'Approve the task to make it ready to start.',
    },
  },
  {
    id: 'T-05',
    title: 'Audit log of sign-in events',
    summary: 'Record successful and failed sign-ins for the security review.',
    type: 'backend',
    status: 'on-hold',
    dependsOn: [],
    started: false,
    workflow: {
      definition: backend,
      position: { kind: 'not-started', firstStep: 'spike' },
      unavailableReason: 'Resume the task to start it.',
    },
  },
  {
    id: 'T-06',
    title: 'SAML fallback for legacy tenants',
    summary: 'Out of scope after the provider decision.',
    type: 'spike',
    status: 'cancelled',
    dependsOn: [],
    started: false,
    workflow: { definition: spike, position: { kind: 'not-started', firstStep: 'spike' } },
  },
  {
    id: 'T-07',
    title: 'Rate-limit session refresh',
    summary: 'Refuse more than one refresh per session per minute.',
    type: 'backend',
    status: 'ready',
    dependsOn: [],
    started: false,
    workflow: {
      definition: backend,
      position: { kind: 'not-started', firstStep: 'spike' },
      canStart: true,
    },
  },
];

export function task(id: string): MockTask {
  const found = tasks.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Unknown mock task ${id}`);
  }

  return found;
}

export function typeOf(item: MockTask): TaskType {
  return taskTypes.find((type) => type.id === item.type)!;
}

export interface HistoryEntry {
  readonly step: string;
  readonly attempt: number;
  readonly actor: string;
  readonly at: string;
  readonly result?: string;
  readonly toStep?: string | null;
  readonly feedback?: string;
  readonly artifacts?: readonly string[];
  readonly tone?: 'success' | 'attention' | 'info' | 'neutral';
  readonly active?: boolean;
  readonly returned?: boolean;
}

/** T-02 attempt history, newest first: review failed, rework active. */
export const backendHistory: readonly HistoryEntry[] = [
  { step: 'implement', attempt: 2, actor: 'You', at: 'Today 11:52', active: true, tone: 'info' },
  {
    step: 'review',
    attempt: 1,
    actor: 'Dominik',
    at: 'Today 11:40',
    result: 'Changes requested',
    toStep: 'implement',
    feedback: reviewFailed.feedback,
    tone: 'attention',
  },
  {
    step: 'implement',
    attempt: 1,
    actor: 'Dominik',
    at: 'Today 10:15',
    result: 'Ready for review',
    toStep: 'review',
    feedback: 'Endpoint, cookie and refresh are in place.',
    artifacts: ['notes/token-exchange.md'],
  },
  {
    step: 'spike',
    attempt: 1,
    actor: 'Dominik',
    at: 'Yesterday 17:20',
    result: 'Approach agreed',
    toStep: 'implement',
    tone: 'success',
  },
];

/** Specification workflow events for its Activity history. */
export const specificationHistory: readonly HistoryEntry[] = [
  {
    step: 'breakdown',
    attempt: 1,
    actor: 'Dominik',
    at: 'Yesterday 15:10',
    result: 'Tasks approved',
    toStep: 'wait-for-tasks',
    feedback: 'Six tasks, two of them spikes.',
  },
  {
    step: 'specification',
    attempt: 1,
    actor: 'Dominik',
    at: 'Yesterday 12:30',
    result: 'Specification agreed',
    toStep: 'breakdown',
    artifacts: ['specification.md', 'ux.md'],
  },
  {
    step: 'requirements',
    attempt: 1,
    actor: 'Dominik',
    at: 'Yesterday 09:05',
    result: 'Requirements agreed',
    toStep: 'specification',
    artifacts: ['requirements.md'],
  },
];

export const taskDocument = `# Token exchange endpoint and session cookie

## Goal

Exchange the provider authorization code for a SpecFlow session and keep it alive while the user works.

## Acceptance

- \`POST /auth/callback\` exchanges the code and sets an HTTP-only session cookie.
- The session refreshes before it expires; an expired session keeps the return URL.
- Failed exchanges are logged without the code.

## Notes

See \`notes/token-exchange.md\` for the provider quirks found in the spike.
`;
