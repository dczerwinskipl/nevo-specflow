import type {
  AgentAttemptView,
  AgentLaunch,
  WorkflowActionProjection,
  WorkflowActor,
} from '@nevo/specflow-contracts/workflow';
import {
  SPEC,
  TASK,
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
  | 'waiting-for-owner'
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
      : c === 'waiting-for-owner'
        ? // The working Turn waits for the owner's answer to a question in its Session.
          {
            state: 'working' as const,
            waitingForOwner: { kind: 'question' as const, interactionId: 'interaction-1' },
          }
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

const CONFIRMATION_FEEDBACK =
  'Five tasks cover the token exchange, the cookie, refresh, the sign-in screen and the audit log. t-05 depends on t-02 and t-04. The audit log has no acceptance criteria in behaviour.md yet; I wrote them into its task.md.';

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
        feedback: CONFIRMATION_FEEDBACK,
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
export function finishedAttemptProjection(
  hold?:
    | { readonly reason: 'attempt-commit-pending' }
    | { readonly reason: 'attempt-commit-failed'; readonly code: string },
): WorkflowActionProjection {
  const base = taskWorkflowProjection('ready-agent', { agent: agentOptions.independent });
  // While the commit waits, the Engine shows every action that writes unavailable and names the
  // attempt (`attemptCommit`), as the projection of a held Specification does.
  const held = hold
    ? {
        attemptCommit: {
          ...hold,
          attemptId: ATTEMPT_ID,
          subject: { specId: SPEC, taskId: TASK },
          step: 'implement',
          attempt: 2,
          stepTitle: 'Implementation',
        },
        actions: Object.fromEntries(
          Object.entries(base.actions).map(([name, action]) => [
            name,
            { ...action, unavailable: hold },
          ]),
        ) as WorkflowActionProjection['actions'],
        ...(base.position.kind === 'ready'
          ? {
              position: {
                ...base.position,
                next: {
                  ...base.position.next,
                  agent: { kind: 'unavailable' as const, reason: hold.reason },
                },
              },
            }
          : {}),
      }
    : {};

  return {
    ...base,
    ...held,
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

/** The story Specification's folder in its checkout. */
const SSO = 'specs/active/single-sign-on';

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
          work: {
            ...work,
            tasks: [],
            declared: [],
            commit: { state: 'none' as const },
            changes: {
              directory: SSO,
              documents: [`${SSO}/tasks/t-04/task.md`, `${SSO}/tasks/t-04/screens.md`],
              tasks: [],
              files: AGENT_FILES,
              state: [`${SSO}/.execution/tasks/t-04.yaml`],
            },
          },
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
            changes: {
              directory: SSO,
              documents: [`${SSO}/tasks/t-04/screens.md`, `${SSO}/tasks/t-04/task.md`],
              tasks: [],
              files: AGENT_FILES,
              state: [`${SSO}/.execution/tasks/t-04.yaml`],
            },
          },
        },
      },
    ],
  };
}

/** The commit of the agent's Breakdown result that waits for the owner, as a story names it. */
export type ConfirmationCommit = 'committed' | 'pending' | 'failed';

/**
 * The Breakdown result waiting for the owner with its attempt commit: Confirm and Reject wait (the
 * projection's `actions.confirm/reject.unavailable`) while the commit runs or after it failed.
 */
export function confirmationWithCommit(commit: ConfirmationCommit): WorkflowActionProjection {
  const projection = specificationConfirmation();
  if (commit === 'committed') {
    return projection;
  }

  const waiting = {
    step: 'breakdown',
    attempt: 1,
    unavailable:
      commit === 'pending'
        ? { reason: 'attempt-commit-pending' as const }
        : { reason: 'attempt-commit-failed' as const, code: 'BRANCH_PROTECTED' },
  };

  return { ...projection, actions: { ...projection.actions, confirm: waiting, reject: waiting } };
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
        endedAt: '2026-11-12T14:05:00Z',
        actor: agentActor,
        // The result waiting for the owner, as the run records it (the Feedback view reads it).
        outcome: {
          kind: 'transition' as const,
          transition: 'tasks-approved',
          feedback: CONFIRMATION_FEEDBACK,
          artifacts: [],
        },
        transitionLabel: 'Tasks approved',
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

/** The folder of the Specification whose Activity history the stories show. */
const ENTRY_FOLDER = 'specs/active/agent-workflow-entry-points';
const ENTRY = ENTRY_FOLDER;

/** A local time `daysAgo` days before today, so the history groups it under Today or Yesterday. */
function localAt(daysAgo: number, hours: number, minutes: number): string {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysAgo,
    hours,
    minutes,
  ).toISOString();
}

/** The twelve Tasks the agent's Breakdown produced, by id and title. */
export const BREAKDOWN_TASKS = [
  ['acceptance-and-coverage', 'End-to-end acceptance and roadmap coverage'],
  ['adhoc-brief-delivery', 'Ad-hoc brief delivery and its conversation entry'],
  ['adhoc-brief-render', 'Ad-hoc brief rendering'],
  ['archetype-first-step', 'First step per archetype in the archetype catalogue'],
  ['close-skill-wrappers-group', 'Close the skill wrappers group'],
  ['create-with-agent', 'Create a specification with the agent'],
  ['e6-confirmation-tests', 'Confirmation tests for the agent result'],
  ['engine-project-file-install', 'Engine installs the project file'],
  ['init-installs-skill', 'Init installs the portable skill'],
  ['owner-decisions-in-step-context', 'Owner decisions in the step context'],
  ['skill-source-and-commands', 'Skill source and its commands'],
  ['transcript-brief-part', 'Transcript brief part'],
].map(([id, title]) => ({ id: id!, title: title! }));

interface SpecAttempt {
  readonly step: string;
  readonly stepTitle: string;
  readonly attempt: number;
  readonly sequence: number;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly outcome?: Record<string, unknown>;
  readonly transitionLabel?: string;
  readonly ended: 'active' | 'finished' | 'returned' | 'taken-over' | 'abandoned';
  readonly events?: readonly {
    readonly kind: string;
    readonly at?: string;
    readonly code?: string;
  }[];
  readonly commit: Record<string, unknown>;
  readonly changes: {
    readonly documents?: readonly string[];
    readonly tasks?: readonly { readonly id: string; readonly title: string }[];
    readonly files?: readonly string[];
    readonly state?: readonly string[];
  };
  readonly extra?: Record<string, unknown>;
  readonly sessionId?: string;
  readonly model?: string;
  /** The Specification folder the attempt's paths lie in. */
  readonly directory?: string;
}

function specAttempt(a: SpecAttempt) {
  const ENTRY = a.directory ?? ENTRY_FOLDER;
  const documents = (a.changes.documents ?? []).map((name) => `${ENTRY}/${name}`);
  const files = a.changes.files ?? [];
  const state = (a.changes.state ?? ['.execution/specification.yaml']).map(
    (name) => `${ENTRY}/${name}`,
  );

  return {
    kind: 'attempt' as const,
    sequence: a.sequence,
    step: a.step,
    stepTitle: a.stepTitle,
    attempt: a.attempt,
    startedAt: a.startedAt,
    ...(a.endedAt ? { endedAt: a.endedAt } : {}),
    actor: {
      ...agentActor,
      details: {
        ...agentActor.details,
        model: a.model ?? 'Opus 5.5',
        sessionId: a.sessionId ?? PLAN_SESSION_ID,
      },
    },
    ...(a.outcome ? { outcome: a.outcome } : {}),
    ...(a.transitionLabel ? { transitionLabel: a.transitionLabel } : {}),
    agent: {
      attemptId: `${a.step}-${String(a.attempt)}`,
      provider: 'claude',
      model: a.model ?? 'Opus 5.5',
      sessionId: a.sessionId ?? PLAN_SESSION_ID,
      turns: 1,
      ended: a.ended,
      events: a.events ?? [
        { kind: 'started', at: a.startedAt },
        { kind: 'turn-started', at: a.startedAt, turn: 1 },
        ...(a.endedAt ? [{ kind: 'turn-ended', at: a.endedAt, turn: 1 }] : []),
      ],
      ...a.extra,
      work: {
        documents: [],
        mixed: [],
        tasks: (a.changes.tasks ?? []).map((task) => task.id),
        declared: files,
        commit: a.commit,
        changes: {
          directory: ENTRY,
          documents,
          tasks: a.changes.tasks ?? [],
          files,
          state,
        },
      },
    },
  };
}

const SHA = '05f9d80c1e2b3a4d5f60718293a4b5c6d7e8f901';

/**
 * The Activity history of a Specification whose agent ran its own steps over two days, one entry per
 * way an attempt ends: waiting for the owner's confirmation, changes requested, completed with twelve
 * Tasks and many files, taken over by the owner (its work kept, not committed), a commit that failed,
 * and an attempt interrupted by a return to an earlier step.
 */
export function specificationAttemptsHistory() {
  const items = [
    specAttempt({
      sequence: 9,
      step: 'review',
      stepTitle: 'Review the breakdown',
      attempt: 2,
      startedAt: localAt(0, 1, 9),
      endedAt: localAt(0, 1, 12),
      outcome: {
        kind: 'transition',
        transition: 'approved',
        result: 'pass',
        feedback:
          'The twelve Tasks cover the roadmap. Install and init stay separate Tasks, as agreed.',
        artifacts: [],
      },
      transitionLabel: 'Breakdown approved',
      ended: 'finished',
      events: [
        { kind: 'started', at: localAt(0, 1, 9) },
        { kind: 'finished', at: localAt(0, 1, 12) },
        { kind: 'awaiting-confirmation', at: localAt(0, 1, 12) },
        { kind: 'committed', at: localAt(0, 1, 12) },
      ],
      commit: { state: 'committed', runs: 1, sha: SHA, documents: 3, files: 0 },
      changes: { documents: ['architecture.md', 'decisions.md', 'overview.md'] },
    }),
    specAttempt({
      sequence: 8,
      step: 'review',
      stepTitle: 'Review the breakdown',
      attempt: 1,
      startedAt: localAt(0, 0, 41),
      endedAt: localAt(0, 0, 47),
      outcome: {
        kind: 'transition',
        transition: 'changes-requested',
        result: 'fail',
        feedback:
          'Split "Init installs the portable skill" from the Engine install: they ship apart.\n\nThe acceptance Task needs the roadmap items it covers.',
        artifacts: [],
      },
      transitionLabel: 'Changes requested',
      ended: 'finished',
      commit: { state: 'committed', runs: 1, sha: 'a41b7c2' + '0'.repeat(33), documents: 1 },
      changes: { documents: ['decisions.md'] },
    }),
    specAttempt({
      sequence: 7,
      step: 'breakdown',
      stepTitle: 'Break the solution down',
      attempt: 3,
      startedAt: localAt(0, 0, 2),
      endedAt: localAt(0, 0, 36),
      outcome: { kind: 'transition', transition: 'completed', artifacts: [] },
      ended: 'finished',
      // The owner took the step over, then handed it back to the agent.
      extra: { handedOverFrom: { attempt: 2 } },
      commit: {
        state: 'committed',
        runs: 1,
        sha: 'c93e01d' + '0'.repeat(33),
        documents: 2,
        files: 6,
      },
      changes: {
        documents: ['architecture.md', 'skill.md'],
        tasks: BREAKDOWN_TASKS,
        files: [
          `${ENTRY}/notes/install-matrix.md`,
          'docs/adr/0042-agent-entry-points.md',
          'packages/specflow/src/skill/install.ts',
          'packages/specflow/src/skill/install.test.ts',
          'packages/specflow-engine/src/project/skill-file.ts',
          'packages/specflow-engine/src/project/skill-file.test.ts',
        ],
        state: [
          '.execution/specification.yaml',
          'specification.yaml',
          'tasks/index.yaml',
          ...BREAKDOWN_TASKS.map((task) => `tasks/${task.id}/task.yaml`),
        ],
      },
    }),
    {
      kind: 'attempt' as const,
      sequence: 6,
      step: 'breakdown',
      stepTitle: 'Break the solution down',
      attempt: 2,
      startedAt: localAt(1, 22, 30),
      endedAt: localAt(1, 23, 55),
      actor: human,
      outcome: { kind: 'taken-over' as const },
    },
    specAttempt({
      sequence: 5,
      step: 'breakdown',
      stepTitle: 'Break the solution down',
      attempt: 1,
      startedAt: localAt(1, 21, 58),
      endedAt: localAt(1, 22, 30),
      outcome: { kind: 'taken-over' },
      ended: 'taken-over',
      extra: { takenOverBy: { attempt: 2 } },
      events: [
        { kind: 'started', at: localAt(1, 21, 58) },
        { kind: 'turn-started', at: localAt(1, 21, 58) },
        { kind: 'proposal-refused', at: localAt(1, 22, 20), code: 'WORKFLOW_GATE_UNMET' },
        { kind: 'turn-ended', at: localAt(1, 22, 24) },
        { kind: 'taken-over', at: localAt(1, 22, 30) },
      ],
      commit: { state: 'none' },
      changes: {
        documents: ['architecture.md'],
        files: ['packages/specflow/src/skill/install.ts'],
      },
    }),
    specAttempt({
      sequence: 4,
      step: 'architecture',
      stepTitle: 'Write the architecture',
      attempt: 2,
      startedAt: localAt(1, 18, 5),
      endedAt: localAt(1, 18, 40),
      outcome: { kind: 'transition', transition: 'completed', artifacts: [] },
      ended: 'finished',
      events: [
        { kind: 'started', at: localAt(1, 18, 5) },
        { kind: 'finished', at: localAt(1, 18, 40) },
        { kind: 'commit-failed', at: localAt(1, 18, 40), code: 'BRANCH_PROTECTED' },
      ],
      commit: { state: 'failed', runs: 1, code: 'BRANCH_PROTECTED' },
      changes: { documents: ['architecture.md', 'decisions.md'] },
    }),
    specAttempt({
      sequence: 3,
      step: 'architecture',
      stepTitle: 'Write the architecture',
      attempt: 1,
      startedAt: localAt(1, 17, 2),
      endedAt: localAt(1, 17, 31),
      outcome: {
        kind: 'returned',
        to: 'requirements',
        feedback: 'The requirements miss the Windows install path; back to Requirements first.',
      },
      ended: 'returned',
      extra: {
        returnRequest: {
          to: 'requirements',
          requestedAt: localAt(1, 17, 30),
          state: 'applied',
        },
      },
      commit: { state: 'none' },
      changes: { documents: ['architecture.md'] },
    }),
  ];

  return { subject: { kind: 'specification' as const, specId: 'sso' }, items };
}

/** The folder of the dogfood Specification nevo-2 the mirrored history lies in. */
const NEVO_2 = 'specs/active/converge-demo-and-project-http-apis';

/** The owner of the mirrored dogfood history. */
export const NEVO_2_OWNER = 'dominikczerwinski';

/** The Sessions of nevo-2's agent attempts (requirements and the Specification share one). */
export const NEVO_2_SESSIONS = [
  { id: 'n2-review-2', title: 'Review the breakdown · attempt 2', at: localAt(1, 17, 4) },
  { id: 'n2-break-2', title: 'Break the solution down · attempt 2', at: localAt(1, 13, 39) },
  { id: 'n2-review-1', title: 'Review the breakdown · attempt 1', at: localAt(1, 13, 32) },
  { id: 'n2-break-1', title: 'Break the solution down · attempt 1', at: localAt(1, 13, 15) },
  { id: 'n2-design', title: 'Design the solution · attempt 1', at: localAt(1, 12, 41) },
  { id: 'n2-gather', title: 'Gather requirements · attempt 1', at: localAt(1, 12, 26) },
] as const;

const nevo2Owner = {
  class: 'human' as const,
  details: { actorId: `user:${NEVO_2_OWNER}`, trust: 'authenticated' as const },
};

const sha = (prefix: string) => prefix + '0'.repeat(40 - prefix.length);

/**
 * nevo-2's Activity history as the live dogfood Runtime records it (2026-11-25, here yesterday):
 * seven agent attempts, the owner's take over and Finish of Design the solution, the owner's
 * Confirm of the second review, then the wait for the Tasks (not listed). Each committed attempt
 * lists what its commit held, grouped as the Engine groups it.
 */
export function nevo2AttemptsHistory() {
  const transition = (id: string, feedback: string, result?: string) => ({
    kind: 'transition',
    transition: id,
    ...(result ? { result } : {}),
    feedback,
    artifacts: [],
  });
  const n2 = (a: Omit<SpecAttempt, 'directory'>) => specAttempt({ ...a, directory: NEVO_2 });
  const items = [
    {
      kind: 'attempt' as const,
      sequence: 9,
      step: 'implementation',
      stepTitle: 'Waiting for Tasks',
      attempt: 1,
      startedAt: localAt(1, 17, 9),
    },
    {
      ...n2({
        sequence: 8,
        step: 'breakdown-review',
        stepTitle: 'Review the breakdown',
        attempt: 2,
        startedAt: localAt(1, 17, 3),
        endedAt: localAt(1, 17, 9),
        outcome: transition(
          'approved',
          'Approved. Attempt 2 resolves all four blocking points and (a)-(d) from attempt 1.',
          'pass',
        ),
        transitionLabel: 'Breakdown approved',
        ended: 'finished',
        sessionId: 'n2-review-2',
        commit: { state: 'committed', runs: 1, sha: sha('3ca401a'), documents: 2, files: 0 },
        changes: { documents: ['architecture.md', 'decisions.md'] },
      }),
      confirmation: { state: 'confirmed', at: localAt(1, 17, 9), actor: nevo2Owner },
    },
    n2({
      sequence: 7,
      step: 'breakdown',
      stepTitle: 'Break the solution down',
      attempt: 2,
      startedAt: localAt(1, 13, 39),
      endedAt: localAt(1, 17, 3),
      outcome: transition('proposed', 'Attempt 2 addresses every point of the review.'),
      transitionLabel: 'Breakdown proposed',
      ended: 'finished',
      sessionId: 'n2-break-2',
      commit: { state: 'committed', runs: 1, sha: sha('0cae210'), documents: 0, files: 0 },
      changes: { tasks: BREAKDOWN_TASKS.slice(0, 11) },
    }),
    n2({
      sequence: 6,
      step: 'breakdown-review',
      stepTitle: 'Review the breakdown',
      attempt: 1,
      startedAt: localAt(1, 13, 32),
      endedAt: localAt(1, 13, 38),
      outcome: transition(
        'changes-requested',
        'The order, scope and design references are mostly right. Four problems block approval.',
        'fail',
      ),
      transitionLabel: 'Changes requested',
      ended: 'finished',
      sessionId: 'n2-review-1',
      commit: { state: 'committed', runs: 1, sha: sha('77864dc'), documents: 0, files: 0 },
      changes: {},
    }),
    n2({
      sequence: 5,
      step: 'breakdown',
      stepTitle: 'Break the solution down',
      attempt: 1,
      startedAt: localAt(1, 13, 15),
      endedAt: localAt(1, 13, 31),
      outcome: transition('proposed', "11 Tasks in the design's delivery order."),
      transitionLabel: 'Breakdown proposed',
      ended: 'finished',
      sessionId: 'n2-break-1',
      commit: { state: 'committed', runs: 1, sha: sha('95b0cdb'), documents: 3, files: 0 },
      changes: { documents: ['architecture.md', 'backend.md', 'decisions.md'] },
    }),
    {
      kind: 'attempt' as const,
      sequence: 4,
      step: 'solution',
      stepTitle: 'Design the solution',
      attempt: 2,
      startedAt: localAt(1, 13, 12),
      endedAt: localAt(1, 13, 13),
      actor: nevo2Owner,
      outcome: transition(
        'designed',
        'Owner took over after the agent process was stopped three times by SpecFlow. architecture.md and decisions.md (D4-D11) are complete and accepted.',
      ),
      transitionLabel: 'Solution designed',
    },
    n2({
      sequence: 3,
      step: 'solution',
      stepTitle: 'Design the solution',
      attempt: 1,
      startedAt: localAt(1, 12, 41),
      endedAt: localAt(1, 13, 12),
      outcome: { kind: 'taken-over' },
      ended: 'taken-over',
      sessionId: 'n2-design',
      extra: { takenOverBy: { attempt: 2 } },
      events: [
        { kind: 'started', at: localAt(1, 12, 41) },
        { kind: 'turn-ended', at: localAt(1, 13, 12) },
        { kind: 'taken-over', at: localAt(1, 13, 12) },
      ],
      commit: { state: 'none' },
      changes: { documents: ['architecture.md', 'decisions.md'] },
    }),
    n2({
      sequence: 2,
      step: 'specification',
      stepTitle: 'Write the Specification',
      attempt: 1,
      startedAt: localAt(1, 12, 35),
      endedAt: localAt(1, 12, 40),
      outcome: transition('written', 'Added backend.md (route parity map) and behaviour.md.'),
      transitionLabel: 'Specification written',
      ended: 'finished',
      sessionId: 'n2-gather',
      model: 'claude-opus-5-5',
      commit: { state: 'committed', runs: 1, sha: sha('cac3c46'), documents: 4, files: 0 },
      changes: {
        documents: ['backend.md', 'behaviour.md', 'decisions.md', 'overview.md'],
        state: ['.execution/specification.yaml', 'specification.yaml'],
      },
    }),
    n2({
      sequence: 1,
      step: 'requirements',
      stepTitle: 'Gather requirements',
      attempt: 1,
      startedAt: localAt(1, 12, 26),
      endedAt: localAt(1, 12, 33),
      outcome: transition('agreed', 'Owner confirmed: full scope A-E in this Specification.'),
      transitionLabel: 'Requirements agreed',
      ended: 'finished',
      sessionId: 'n2-gather',
      commit: { state: 'committed', runs: 1, sha: sha('6d63397'), documents: 2, files: 0 },
      changes: { documents: ['decisions.md', 'overview.md'] },
    }),
  ];

  return { subject: { kind: 'specification' as const, specId: 'nevo-2' }, items };
}
