import type {
  AgentAttemptView,
  AgentLaunch,
  WorkflowActionProjection,
  WorkflowActor,
} from '@nevo/specflow-contracts/workflow';
import {
  specificationWorkflowProjection,
  taskWorkflowProjection,
} from '../projections.stories-support';
import { SESSION_ID, agentOptions } from './agentStart.stories-support';

/*
 * The agent's attempt of the story Task (Implementation, attempt 2) in each state the Now block
 * explains, and the Specification's Breakdown whose result waits for the owner: shared by the stories
 * and the component tests.
 */

export const PLAN_SESSION_ID = 's-plan-1';
export const PLAN_SESSION_TITLE = 'Break down single sign-on';

export const STORY_SHA = '3f9a1c7e5b2d4a6c8e0f1b3d5a7c9e2f4b6d8a0c';
export const ATTEMPT_ID = '5d1c1a52-8f3e-4a6b-9a0e-3b7f2c9d1e44';

export type AttemptCase =
  | 'working'
  | 'stopping'
  | 'unknown'
  | 'session-missing'
  | 'stopped'
  | 'refused'
  | 'continue-refused'
  | 'session-gone'
  | 'return-requested'
  | 'return-stop-failed'
  | 'return-next-action'
  | 'confirmation';

type AgentActor = Extract<WorkflowActor, { class: 'agent' }>;

export const agentActor: AgentActor = {
  class: 'agent',
  details: {
    archetype: 'implementer',
    provider: 'claude',
    model: 'Sonnet 5',
    sessionId: SESSION_ID,
  },
};

const launch: AgentLaunch = {
  archetype: 'implementer',
  provider: 'claude',
  model: 'claude-sonnet',
  session: { mode: 'reuse', sessionId: SESSION_ID },
};

const ended = { state: 'ended' as const, endedAt: '2026-11-13T12:10:00Z' };

/** What the stopped agent left: two documents and three changed files, nothing committed. */
export const AGENT_FILES = ['src/auth/refresh.ts', 'src/auth/state.ts', 'src/auth/refresh.test.ts'];
const work: AgentAttemptView['work'] = {
  documents: [
    'specs/active/single-sign-on/tasks/t-04/task.md',
    'specs/active/single-sign-on/tasks/t-04/screens.md',
  ],
  mixed: [],
  tasks: [],
  declared: [],
  changed: { paths: AGENT_FILES },
  commit: { state: 'none' },
};

function view(c: Exclude<AttemptCase, 'confirmation'>): AgentAttemptView {
  const turn = {
    turnId: 'turn-1',
    boundAt: '2026-11-13T11:52:00Z',
    ...(c === 'working'
      ? { state: 'working' as const }
      : c === 'stopping'
        ? { state: 'stopping' as const }
        : c === 'unknown'
          ? { state: 'unknown' as const }
          : c === 'return-requested' || c === 'return-stop-failed'
            ? { state: 'stopping' as const }
            : c === 'session-missing'
              ? { state: 'session-missing' as const }
              : ended),
  };

  return {
    attemptId: ATTEMPT_ID,
    step: 'implement',
    attempt: 2,
    sessionId: SESSION_ID,
    provider: 'claude',
    model: 'claude-sonnet',
    turn,
    turns: 1,
    ...(c === 'refused'
      ? {
          proposal: {
            transition: 'ready-for-review',
            state: 'refused' as const,
            submittedAt: '2026-11-13T12:10:00Z',
            refusal: {
              code: 'WORKFLOW_UNREGISTERED_DOCUMENTS',
              message: 'display only',
              paths: ['specs/active/single-sign-on/notes.md'],
            },
          },
        }
      : {}),
    work,
    takeOver:
      c === 'working' || c === 'stopping' || c === 'return-requested' || c === 'return-stop-failed'
        ? {
            kind: 'unavailable',
            reason: c === 'working' || c === 'stopping' ? 'agent-working' : 'return-requested',
          }
        : c === 'unknown'
          ? { kind: 'unavailable', reason: 'outcome-unknown' }
          : { kind: 'available' },
    ...(c === 'return-requested' || c === 'return-stop-failed' || c === 'return-next-action'
      ? {
          returnRequest: {
            to: 'design',
            requestedAt: '2026-11-13T12:05:00Z',
            state: 'requested' as const,
            ...(c === 'return-stop-failed'
              ? { stop: 'failed' as const }
              : c === 'return-requested'
                ? { stop: 'sent' as const }
                : { appliesOn: 'next-action' as const }),
          },
        }
      : {}),
    continue:
      c === 'continue-refused'
        ? {
            kind: 'unavailable',
            reason: 'baseline-changed',
            paths: ['src/auth/refresh.ts', 'docs/notes.md'],
            count: 2,
          }
        : c === 'session-gone'
          ? { kind: 'unavailable', reason: 'session-unavailable', launch }
          : { kind: 'available', launch },
  };
}

/** The Task's Implementation as its agent's attempt, in one state. */
function taskAttempt(c: Exclude<AttemptCase, 'confirmation'>): WorkflowActionProjection {
  const base = taskWorkflowProjection('rework');
  if (base.position.kind !== 'active') {
    return base;
  }

  const { finish: _finish, ...actions } = base.actions;

  return {
    ...base,
    position: {
      ...base.position,
      attempt: { ...base.position.attempt, actor: agentActor },
      exits: base.position.exits,
    },
    actions,
    agentAttempt: view(c),
  };
}

/** The Specification's Breakdown: the agent's result waits for the owner's Confirm or Reject. */
function specificationConfirmation(): WorkflowActionProjection {
  const base = specificationWorkflowProjection('waiting');

  return {
    ...base,
    position: {
      kind: 'awaiting-confirmation',
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
        endedAt: '2026-11-12T14:05:00Z',
        actor: {
          ...agentActor,
          details: {
            ...agentActor.details,
            archetype: 'planner',
            sessionId: PLAN_SESSION_ID,
          },
        },
      },
      proposal: {
        transition: {
          id: 'tasks-approved',
          label: 'Tasks approved',
          target: { kind: 'step', step: 'wait-for-tasks' },
          targetTitle: 'Waiting for tasks',
          feedback: 'optional',
        },
        feedback:
          'Five tasks cover the token exchange, the cookie, refresh, the sign-in screen and the audit log. t-05 depends on t-02 and t-04. The audit log has no acceptance criteria in behaviour.md yet; I wrote them into its task.md.',
        artifacts: [],
      },
      confirms: { approvesDrafts: ['t-01', 't-02', 't-03', 't-04', 't-05'] },
      confirmsDigest: 'a'.repeat(64),
    },
    actions: {
      confirm: { step: 'breakdown', attempt: 1 },
      reject: { step: 'breakdown', attempt: 1 },
      return: { targets: [{ step: 'breakdown', title: 'Breakdown', feedback: 'optional' }] },
    },
  };
}

/** The projection of a subject in an agent attempt case; the Specification's for `confirmation`. */
export function agentAttemptProjection(c: AttemptCase): WorkflowActionProjection {
  return c === 'confirmation' ? specificationConfirmation() : taskAttempt(c);
}

/** Review is ready after the agent finished Implementation: its hand-off is the agent's. */
export function finishedAttemptProjection(): WorkflowActionProjection {
  const base = taskWorkflowProjection('ready-agent', { agent: agentOptions.independent });

  return {
    ...base,
    handoff: {
      kind: 'transition',
      from: {
        step: 'implement',
        attempt: 2,
        title: 'Implementation',
        at: '2026-11-14T09:10:00Z',
        actor: agentActor,
      },
      transition: 'done',
      label: 'Done',
      result: 'done',
      artifacts: [],
    },
  };
}

const human = {
  class: 'human' as const,
  details: { actorId: 'local:dominik', trust: 'local' as const },
};

/**
 * The Task's workflow history after the owner took Implementation over from the agent: the owner's
 * attempt 3 runs, the agent's attempt 2 stopped without a result and its work stays uncommitted.
 */
export function takenOverAttemptHistory() {
  return {
    subject: { kind: 'task' as const, specId: 'sso', taskId: 't-04' },
    items: [
      {
        kind: 'attempt' as const,
        sequence: 4,
        step: 'implement',
        stepTitle: 'Implementation',
        attempt: 3,
        startedAt: '2026-11-13T12:15:00Z',
        actor: human,
      },
      {
        kind: 'attempt' as const,
        sequence: 3,
        step: 'implement',
        stepTitle: 'Implementation',
        attempt: 2,
        startedAt: '2026-11-13T11:52:00Z',
        endedAt: '2026-11-13T12:15:00Z',
        actor: agentActor,
        outcome: { kind: 'taken-over' as const },
        agent: {
          attemptId: ATTEMPT_ID,
          provider: 'claude',
          model: 'Sonnet 5',
          sessionId: SESSION_ID,
          turns: 1,
          ended: 'taken-over' as const,
          takenOverBy: { attempt: 3 },
          events: [
            { kind: 'started' as const, at: '2026-11-13T11:52:00Z' },
            { kind: 'turn-started' as const, at: '2026-11-13T11:52:00Z', turn: 1 },
            { kind: 'turn-ended' as const, at: '2026-11-13T12:10:00Z', turn: 1 },
            { kind: 'taken-over' as const, at: '2026-11-13T12:15:00Z' },
          ],
          work: { ...work, tasks: [], declared: [], commit: { state: 'none' as const } },
        },
      },
    ],
  };
}

/** The workflow history whose newest attempt is that agent attempt, with its commit result. */
export function finishedAttemptHistory(commit: {
  state: 'committed' | 'failed' | 'pending';
  code?: string;
  sha?: string;
  documents?: number;
  files?: number;
}) {
  return {
    subject: { kind: 'task' as const, specId: 'sso', taskId: 't-04' },
    items: [
      {
        kind: 'attempt' as const,
        sequence: 2,
        step: 'implement',
        stepTitle: 'Implementation',
        attempt: 2,
        startedAt: '2026-11-13T11:52:00Z',
        actor: agentActor,
        agent: {
          attemptId: ATTEMPT_ID,
          provider: 'claude',
          sessionId: SESSION_ID,
          turns: 1,
          ended: 'finished' as const,
          events: [],
          work: {
            documents: [
              'specs/active/single-sign-on/tasks/t-04/task.md',
              'specs/active/single-sign-on/tasks/t-04/screens.md',
            ],
            mixed: [],
            tasks: [],
            declared: AGENT_FILES,
            commit,
          },
        },
      },
    ],
  };
}

/** The commit of the agent's Breakdown result that waits for the owner, as a story names it. */
export type ConfirmationCommit = 'committed' | 'pending' | 'failed';

/**
 * The Breakdown result waiting for the owner with its attempt commit: Confirm waits (the projection's
 * `actions.confirm.unavailable`) while the commit runs or after it failed.
 */
export function confirmationWithCommit(commit: ConfirmationCommit): WorkflowActionProjection {
  const projection = specificationConfirmation();
  if (commit === 'committed') {
    return projection;
  }

  return {
    ...projection,
    actions: {
      ...projection.actions,
      confirm: {
        step: 'breakdown',
        attempt: 1,
        unavailable:
          commit === 'pending'
            ? { reason: 'attempt-commit-pending' }
            : { reason: 'attempt-commit-failed', code: 'BRANCH_PROTECTED' },
      },
    },
  };
}

/** The Specification's history whose newest attempt is the agent's Breakdown, with its commit. */
export function confirmationAttemptHistory(commit: ConfirmationCommit) {
  return {
    subject: { kind: 'specification' as const, specId: 'sso' },
    items: [
      {
        kind: 'attempt' as const,
        sequence: 4,
        step: 'breakdown',
        stepTitle: 'Breakdown',
        attempt: 1,
        startedAt: '2026-11-12T13:20:00Z',
        actor: agentActor,
        agent: {
          attemptId: ATTEMPT_ID,
          provider: 'claude',
          sessionId: PLAN_SESSION_ID,
          turns: 1,
          ended: 'finished' as const,
          events: [],
          work: {
            documents: [
              'specs/active/single-sign-on/tasks/t-01/task.md',
              'specs/active/single-sign-on/tasks/t-02/task.md',
            ],
            mixed: [],
            tasks: ['t-01', 't-02', 't-03', 't-04', 't-05'],
            declared: [],
            commit:
              commit === 'committed'
                ? {
                    state: 'committed' as const,
                    sha: '3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345',
                    documents: 7,
                    files: 0,
                  }
                : commit === 'pending'
                  ? { state: 'pending' as const }
                  : { state: 'failed' as const, code: 'BRANCH_PROTECTED' },
          },
        },
      },
    ],
  };
}
