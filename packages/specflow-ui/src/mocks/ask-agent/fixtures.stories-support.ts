import type {
  WorkflowActionProjection,
  WorkflowActor,
  WorkflowStep,
} from '@nevo/specflow-contracts/workflow';

/*
 * PRESENTATION MOCK ONLY (Ask agent, docs/product/specflow/ui/workflow-execution.md#ask-agent).
 * Projections the mock Now blocks read. The fields Ask agent adds to the projection (the agent
 * attempt's Session, its unresolved state, a pending owner confirmation) are not in the contract
 * yet: the mock passes them to the Now block as display props instead.
 */

export const SPEC = 'sso';
export const TASK = 't-04';
export const BRANCH = 'nevo-1/single-sign-on';
export const SESSION_TITLE = 'Implement token exchange';

export const claude: WorkflowActor = {
  class: 'agent',
  details: {
    archetype: 'implementer',
    provider: 'Claude',
    model: 'Sonnet 5',
    sessionId: 's-7f3a',
  },
};

const dominik: WorkflowActor = {
  class: 'human',
  details: { actorId: 'local:dominik', trust: 'local' },
};

const allowed = { kind: 'allowed' } as const;
const unavailable = <R extends string>(reason: R) => ({ kind: 'unavailable' as const, reason });

const lifecycle = {
  approve: unavailable('status'),
  hold: unavailable('active-attempt'),
  resume: unavailable('status'),
  cancel: allowed,
  remove: unavailable('started'),
} as NonNullable<WorkflowActionProjection['task']>;

const workflow = {
  workflowId: 'build',
  version: 4,
  revision: 'rev-build-4',
  title: 'Build and review',
};

export const implementStep: WorkflowStep = {
  id: 'implement',
  title: 'Implementation',
  kind: 'work',
  purpose: 'Write the code and its tests so the behaviour in task.md works.',
  executors: ['agent', 'human'],
};

export const reviewStep: WorkflowStep = {
  id: 'review',
  title: 'Review',
  kind: 'work',
  purpose: 'Check the change against task.md and record what was verified.',
  executors: ['agent', 'human'],
};

const subject = { kind: 'task' as const, specId: SPEC, taskId: TASK };

const reviewHandoff = {
  kind: 'transition' as const,
  from: {
    step: 'review',
    attempt: 1,
    title: 'Review',
    at: '2026-11-13T11:40:00Z',
    actor: dominik,
  },
  transition: 'changes-requested',
  label: 'Changes requested',
  feedback:
    'The refresh path drops the original return URL when the cookie expires mid-request. Keep it in the state parameter and add a test for the expiry case.',
  artifacts: [],
};

/** Implementation, ready to start its second attempt after a review asked for changes. */
export function readyImplementation(): WorkflowActionProjection {
  return {
    subject,
    workflow,
    position: {
      kind: 'ready',
      next: { step: implementStep, human: true, agent: { kind: 'available' } },
    },
    handoff: reviewHandoff,
    actions: { start: { step: 'implement', firstStart: false } },
    task: lifecycle,
  };
}

/** Implementation, attempt 2, run by the agent (running, stopping, ended without a finish). */
export function agentImplementation(): WorkflowActionProjection {
  return {
    subject,
    workflow,
    position: {
      kind: 'active',
      step: implementStep,
      attempt: { number: 2, startedAt: '2026-11-13T11:52:00Z', actor: claude },
      exits: [
        {
          id: 'ready-for-review',
          label: 'Ready for review',
          target: { kind: 'step', step: 'review' },
          targetTitle: 'Review',
          feedback: 'optional',
        },
      ],
    },
    handoff: reviewHandoff,
    actions: {
      return: { targets: [{ step: 'design', title: 'Design', feedback: 'required' }] },
    },
    task: lifecycle,
  };
}

/** Implementation, attempt 3, the owner's own after taking over from the agent. */
export function takenOverImplementation(): WorkflowActionProjection {
  const agent = agentImplementation();

  return {
    ...agent,
    position: {
      ...(agent.position as Extract<WorkflowActionProjection['position'], { kind: 'active' }>),
      attempt: { number: 3, startedAt: '2026-11-13T12:15:00Z', actor: dominik },
    },
    actions: {
      ...agent.actions,
      finish: {
        step: 'implement',
        attempt: 3,
        transitions: [
          {
            id: 'ready-for-review',
            label: 'Ready for review',
            target: { kind: 'step', step: 'review' },
            targetTitle: 'Review',
            feedback: 'optional',
          },
        ],
      },
    },
  };
}

/** Review is ready after the agent finished Implementation (its hand-off is the agent's). */
export function readyReviewAfterAgent(): WorkflowActionProjection {
  return {
    subject,
    workflow,
    position: {
      kind: 'ready',
      next: { step: reviewStep, human: true, agent: { kind: 'available' } },
    },
    handoff: {
      kind: 'transition',
      from: {
        step: 'implement',
        attempt: 2,
        title: 'Implementation',
        at: '2026-11-13T12:18:00Z',
        actor: claude,
      },
      transition: 'ready-for-review',
      label: 'Ready for review',
      feedback:
        'The return URL now travels in the state parameter and survives a refresh. Added refresh.test.ts with the mid-request expiry case.',
      artifacts: [],
    },
    actions: { start: { step: 'review', firstStart: false } },
    task: lifecycle,
  };
}

/** The Specification's Breakdown, its agent attempt waiting for the owner's confirmation. */
export function breakdownAwaitingConfirmation(): WorkflowActionProjection {
  return {
    subject: { kind: 'specification', specId: SPEC },
    workflow: {
      workflowId: 'feature',
      version: 3,
      revision: 'rev-feature-3',
      title: 'Feature specification',
    },
    position: {
      kind: 'active',
      step: {
        id: 'breakdown',
        title: 'Breakdown',
        kind: 'work',
        purpose: 'Split the agreed solution into tasks that can be done and reviewed one by one.',
        executors: ['agent', 'human'],
        produces: 'tasks',
      },
      attempt: {
        number: 1,
        startedAt: '2026-11-12T13:20:00Z',
        actor: { ...claude, details: { ...claude.details, archetype: 'planner' } },
      },
      exits: [],
    },
    actions: {},
    specification: {
      createTask: allowed,
      taskTypes: [],
      exit: { close: { kind: 'blocked', blockers: [] }, abandon: allowed },
    },
  } as unknown as WorkflowActionProjection;
}
