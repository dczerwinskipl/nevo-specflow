import {
  finishStep,
  setTaskStatus,
  startSpecificationExecution,
  startTaskExecution,
  type OwnerActor,
  type TaskProposal,
  type WorkflowActor,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import type { DemoClock } from '../../workflow';

/**
 * The demo catalogue's workflow state, reached through the Engine's own commands (never written
 * directly): Specifications at different steps, and Tasks done, in review, in progress (by the owner
 * or by an agent Session of the demo Sessions), on hold with a reason and blocked by a dependency.
 */

const owner: OwnerActor = { class: 'human', details: { actorId: 'demo-user', trust: 'local' } };

/** The agent Sessions of the demo catalogue that work on a Task (`currentExecutions`). */
export const demoAgentSessions = {
  admission: '00000000-0000-4000-8000-000000000024',
  providers: '00000000-0000-4000-8000-000000000042',
} as const;

const agent = (sessionId: string): WorkflowActor => ({
  class: 'agent',
  details: { provider: 'claude', sessionId },
});

/** Where a seeded Task stands; `ready` Tasks with an open dependency are blocked by it. */
type TaskState =
  | { readonly kind: 'done' }
  | { readonly kind: 'review' }
  | { readonly kind: 'working'; readonly actor?: WorkflowActor }
  | { readonly kind: 'ready' }
  | { readonly kind: 'on-hold'; readonly reason: string };

interface TaskSeed extends TaskProposal {
  readonly state: TaskState;
}

interface SpecificationSeed {
  readonly specId: string;
  /** The steps finished in order; the next one is where the Specification stands. */
  readonly finished: readonly string[];
  /** The Tasks of the breakdown, in dependency order; absent before the breakdown. */
  readonly tasks?: readonly TaskSeed[];
}

const throughBreakdown = [
  'requirements',
  'specification',
  'solution',
  'breakdown',
  'breakdown-review',
] as const;

const done = { kind: 'done' } as const;
const review = { kind: 'review' } as const;
const ready = { kind: 'ready' } as const;

export const demoWorkflowSeeds: readonly SpecificationSeed[] = [
  {
    specId: 'admission',
    finished: throughBreakdown,
    tasks: [
      {
        id: 'admission-contract',
        title: 'Task admission contract',
        type: 'implementation',
        state: done,
      },
      {
        id: 'queue-validation',
        title: 'Queue validation after restart',
        type: 'implementation',
        dependsOn: ['admission-contract'],
        state: { kind: 'working', actor: agent(demoAgentSessions.admission) },
      },
      {
        id: 'execution-boundaries',
        title: 'Agent execution boundaries',
        type: 'implementation',
        dependsOn: ['queue-validation'],
        state: ready,
      },
      {
        id: 'expired-sessions',
        title: 'Expired session handling',
        type: 'implementation',
        state: {
          kind: 'on-hold',
          reason: 'Waiting for the owner to decide how long a session lasts.',
        },
      },
      {
        id: 'return-context',
        title: 'Return to the Specification context',
        type: 'ui-implementation',
        state: review,
      },
    ],
  },
  {
    specId: 'security',
    // The breakdown waits for its review: the drafts are not approved yet.
    finished: ['requirements', 'specification', 'solution', 'breakdown'],
    tasks: [
      { id: 'policy-model', title: 'Access policy model', type: 'implementation', state: ready },
      {
        id: 'route-checks',
        title: 'Capability checks on every route',
        type: 'implementation',
        dependsOn: ['policy-model'],
        state: ready,
      },
    ],
  },
  {
    specId: 'review',
    finished: throughBreakdown,
    tasks: [
      { id: 'evidence-model', title: 'Review evidence model', type: 'implementation', state: done },
      {
        id: 'handover-report',
        title: 'Verification handover report',
        type: 'implementation',
        dependsOn: ['evidence-model'],
        state: review,
      },
      {
        id: 'evidence-viewer',
        title: 'Evidence viewer',
        type: 'ui-implementation',
        dependsOn: ['evidence-model'],
        state: review,
      },
      {
        id: 'reviewer-checklist',
        title: 'Reviewer checklist',
        type: 'implementation',
        state: review,
      },
    ],
  },
  {
    specId: 'packaging',
    finished: throughBreakdown,
    tasks: [
      { id: 'bundle-layout', title: 'Single bundle layout', type: 'implementation', state: done },
      { id: 'install-script', title: 'Installation script', type: 'implementation', state: done },
      {
        id: 'artifact-check',
        title: 'Artifact integrity check',
        type: 'implementation',
        dependsOn: ['bundle-layout'],
        state: ready,
      },
      {
        id: 'install-smoke',
        title: 'Installation smoke test',
        type: 'implementation',
        state: ready,
      },
    ],
  },
  {
    specId: 'providers',
    finished: throughBreakdown,
    tasks: [
      {
        id: 'diagnostics-capture',
        title: 'Provider diagnostics capture',
        type: 'implementation',
        state: done,
      },
      {
        id: 'replay-runner',
        title: 'Replay runner',
        type: 'implementation',
        dependsOn: ['diagnostics-capture'],
        state: { kind: 'working', actor: agent(demoAgentSessions.providers) },
      },
      {
        id: 'provider-errors',
        title: 'Provider error mapping',
        type: 'implementation',
        state: { kind: 'working' },
      },
      {
        id: 'quota-display',
        title: 'Quota display',
        type: 'implementation',
        state: { kind: 'on-hold', reason: 'The providers do not report quotas the same way yet.' },
      },
      {
        id: 'replay-docs',
        title: 'Replay documentation',
        type: 'implementation',
        dependsOn: ['quota-display'],
        state: ready,
      },
    ],
  },
  // `localization` is a draft: its workflow has not started.
];

const REVIEW_PASSED = { result: 'pass' } as const;

async function seedSpecification(
  workflow: WorkflowDependencies,
  seed: SpecificationSeed,
  tick: () => void,
): Promise<void> {
  const archetype = await workflow.references.archetype(seed.specId);
  const subject = { kind: 'specification', specId: seed.specId } as const;
  for (const step of seed.finished) {
    tick();
    const started = await startSpecificationExecution(workflow, {
      specId: seed.specId,
      archetype,
      actor: owner,
    });
    if (started.kind === 'terminal' || started.context.step.id !== step) {
      throw new Error(`The demo seed of "${seed.specId}" expected the step "${step}".`);
    }

    tick();
    await finishStep(workflow, {
      subject,
      step,
      attempt: started.context.attempt,
      input:
        step === 'breakdown'
          ? { tasks: (seed.tasks ?? []).map(({ state: _state, ...proposal }) => proposal) }
          : step === 'breakdown-review'
            ? REVIEW_PASSED
            : {},
      actor: owner,
    });
  }

  // Drafts are approved by the breakdown review; before it, they stay drafts.
  if (!seed.finished.includes('breakdown-review')) {
    return;
  }

  for (const task of seed.tasks ?? []) {
    await seedTask(workflow, seed.specId, task, tick);
  }
}

async function seedTask(
  workflow: WorkflowDependencies,
  specId: string,
  task: TaskSeed,
  tick: () => void,
): Promise<void> {
  const subject = { kind: 'task', specId, taskId: task.id } as const;
  const run = async (actor: WorkflowActor, input?: Record<string, unknown>) => {
    tick();
    const started = await startTaskExecution(workflow, { specId, taskId: task.id, actor });
    if (started.kind === 'terminal') {
      throw new Error(`The demo Task "${task.id}" ended early.`);
    }

    if (input) {
      tick();
      await finishStep(workflow, {
        subject,
        step: started.context.step.id,
        attempt: started.context.attempt,
        input,
        actor,
      });
    }
  };

  switch (task.state.kind) {
    case 'done':
      await run(owner, {});
      await run(owner, REVIEW_PASSED);

      return;
    case 'review':
      await run(owner, {});

      return;
    case 'working':
      await run(task.state.actor ?? owner);

      return;
    case 'on-hold':
      tick();
      await setTaskStatus(workflow, {
        specId,
        taskId: task.id,
        status: 'on-hold',
        reason: task.state.reason,
        actor: owner,
      });

      return;
    case 'ready':
      return;
  }
}

/** Seeds {@link demoWorkflowSeeds}, each step recorded a few minutes after the previous one. */
export async function seedDemoWorkflow(
  workflow: WorkflowDependencies,
  clock: DemoClock,
): Promise<void> {
  let at = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const tick = () => {
    at += 7 * 60 * 1000;
    clock.at(new Date(at));
  };

  for (const seed of demoWorkflowSeeds) {
    await seedSpecification(workflow, seed, tick);
  }
}
