import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../../definitions/catalogue';
import { finishStep } from '../../operations/finish';
import { inspectExecution } from '../../operations/inspect';
import {
  SPEC,
  TWO_TASKS,
  claude,
  owner,
  positionOf,
  runToBreakdown,
  seedExecutionCatalogue,
  specification,
  startSpecification,
} from '../../operations/operations.test-support';
import type { AgentActor } from '../../state/model';
import { finalizeAgentAttempt } from '../finalize/finalize';
import { memoryAgentDependencies } from '../memory.test-support';
import { proposeAgentFinish } from '../proposal/propose';
import { startAgentAttempt } from '../start';
import { confirmAgentResult, rejectAgentResult } from './confirmation';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

const WORKSPACE = '1f0c6a52-6a43-4c55-9d3e-1b7a5d2f8c01';
const ATTEMPT_ID = '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02';
const INVOCATION = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const REQUEST_1 = '5d4fae96-ae87-4a99-9b7c-5fbec16dc005';
const REQUEST_2 = '6e5fbfa7-bf98-4baa-8c8d-6acfd27ed106';
const reviewer: AgentActor = {
  class: 'agent',
  details: { archetype: 'reviewer', provider: 'codex', sessionId: 'session-r' },
};
const REVIEW = { subject: specification, step: 'breakdown-review', attempt: 1 } as const;
const AWAITING = { state: 'awaiting-confirmation', step: 'breakdown-review', attempt: 1 } as const;

/**
 * The breakdown drafted {@link TWO_TASKS}; an agent reviewed them and proposed `pass`, whose
 * `approve-draft-tasks` is owner authority; its Turn ended and was finalized.
 */
async function reviewAwaitingOwner(
  input: Parameters<typeof proposeAgentFinish>[1]['input'] = {
    result: 'pass',
    feedback: 'Both Tasks are ready.',
  },
) {
  const fixture = memoryAgentDependencies(catalogue, ATTEMPT_ID);
  const { dependencies, workflow, claims, state } = fixture;
  await runToBreakdown(workflow);
  await finishStep(workflow, {
    subject: specification,
    step: 'breakdown',
    attempt: 1,
    input: { tasks: TWO_TASKS },
    actor: claude,
  });
  claims.set(INVOCATION, { phase: 'dispatched' });
  await startAgentAttempt(dependencies, {
    subject: specification,
    archetype: 'feature',
    actor: reviewer,
    expected: { step: 'breakdown-review' },
    workspaceId: WORKSPACE,
    turn: { invocationId: INVOCATION, turnId: 'turn-1' },
  });
  const proposed = await proposeAgentFinish(dependencies, {
    turn: { attemptId: ATTEMPT_ID, invocationId: INVOCATION, actor: reviewer, ...REVIEW },
    input,
  });
  state.claimDispatched = false;
  const finalized = await finalizeAgentAttempt(dependencies, {
    attemptId: ATTEMPT_ID,
    intent: { operationId: INVOCATION, ownerId: 'session-r', binding: 'c'.repeat(64) },
    receipt: { invocationId: INVOCATION, process: 'stopped', outcome: 'completed' },
  });
  fixture.events.length = 0;

  return { ...fixture, proposed, finalized };
}

async function taskStatuses(fixture: { workflow: Parameters<typeof inspectExecution>[0] }) {
  const inspection = await inspectExecution(fixture.workflow, SPEC);

  return Object.fromEntries(
    inspection.tasks.map((entry) => [entry.record.taskId, entry.record.status]),
  );
}

describe('an agent result that waits for the owner (D17)', () => {
  it('is recorded and finalized into a pending confirmation, not applied', async () => {
    const fixture = await reviewAwaitingOwner();

    expect(fixture.proposed.proposal).toMatchObject({ state: 'pending', transition: 'approved' });
    expect(fixture.finalized).toMatchObject({ kind: 'awaiting-confirmation' });
    expect(await positionOf(fixture.workflow, specification)).toEqual(AWAITING);
    expect(await taskStatuses(fixture)).toEqual({ api: 'draft', screen: 'draft' });
    // The attempt commit waits for the owner's confirmation: no post action ran.
    expect(fixture.state.postActionRuns).toEqual([]);
    const journal = await fixture.dependencies.journal.read(ATTEMPT_ID);
    expect(journal).toMatchObject({ proposal: { state: 'finalized' } });
    expect(journal?.confirmation?.state).toBe('pending');
    expect(journal?.postActions).toBeUndefined();
  });

  it('is applied by the owner’s Confirm: drafts approved, next step, attempt commit', async () => {
    const fixture = await reviewAwaitingOwner();
    const confirm = { ...REVIEW, actor: owner, requestId: REQUEST_1 };

    const confirmed = await confirmAgentResult(fixture.dependencies, confirm);
    expect(confirmed).toMatchObject({
      transition: 'approved',
      position: { state: 'active', step: 'implementation', attempt: 1 },
      postActions: [{ action: 'attempt-commit', status: 'completed' }],
    });
    expect(await taskStatuses(fixture)).toEqual({ api: 'ready', screen: 'ready' });
    expect(fixture.state.postActionRuns).toHaveLength(1);
    // After the confirmation's section, never inside a lock section.
    expect(fixture.events.indexOf('post-action')).toBeGreaterThan(fixture.events.indexOf('unlock'));
    expect(fixture.events).not.toContain('post-action-in-lock');
    expect(fixture.journal.settled.get(ATTEMPT_ID)?.confirmation?.state).toBe('confirmed');

    // The same request again changes nothing and commits nothing again; another one is refused.
    const again = await confirmAgentResult(fixture.dependencies, confirm);
    expect(again).toMatchObject({ replayed: true, postActions: [] });
    expect(fixture.state.postActionRuns).toHaveLength(1);
    await expect(
      confirmAgentResult(fixture.dependencies, { ...confirm, requestId: REQUEST_2 }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    await expect(
      rejectAgentResult(fixture.dependencies, { ...confirm, feedback: 'No.' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });

  it('goes back to the step on the owner’s Reject, with the feedback, nothing committed', async () => {
    const fixture = await reviewAwaitingOwner();
    const reject = {
      ...REVIEW,
      actor: owner,
      requestId: REQUEST_1,
      feedback: 'Split the screen Task.',
    };
    await expect(
      rejectAgentResult(fixture.dependencies, { ...reject, feedback: ' ' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });

    const rejected = await rejectAgentResult(fixture.dependencies, reject);
    expect(rejected).toMatchObject({
      position: { state: 'ready', step: 'breakdown-review' },
      continuation: { kind: 'attention', step: 'breakdown-review' },
    });
    expect(await taskStatuses(fixture)).toEqual({ api: 'draft', screen: 'draft' });
    expect(fixture.state.postActionRuns).toEqual([]);
    const settled = fixture.journal.settled.get(ATTEMPT_ID);
    expect(settled?.confirmation?.state).toBe('rejected');
    expect(settled?.postActions).toBeUndefined();

    // The next attempt reads the owner's feedback first.
    const inspection = await inspectExecution(fixture.workflow, SPEC);
    expect(inspection.specification?.handoff).toEqual({
      kind: 'return',
      at: expect.any(String) as unknown,
      feedback: 'Split the screen Task.',
    });
    expect((await rejectAgentResult(fixture.dependencies, reject)).replayed).toBe(true);
    const started = await startSpecification(fixture.workflow, owner);
    expect(started).toMatchObject({ kind: 'started' });
    expect(await positionOf(fixture.workflow, specification)).toEqual({
      state: 'active',
      step: 'breakdown-review',
      attempt: 2,
    });
  });

  it('is decided only by the owner, and only while it waits', async () => {
    const fixture = await reviewAwaitingOwner();
    const decide = { ...REVIEW, requestId: REQUEST_1 };

    await expect(
      confirmAgentResult(fixture.dependencies, { ...decide, actor: reviewer as never }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED' });
    await expect(
      confirmAgentResult(fixture.dependencies, { ...decide, step: 'breakdown', actor: owner }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    await expect(startSpecification(fixture.workflow, owner)).rejects.toMatchObject({
      code: 'WORKFLOW_POSITION_INVALID',
    });
    expect(await positionOf(fixture.workflow, specification)).toEqual(AWAITING);
  });

  it('keeps an agent’s Task decisions with the pending confirmation and applies them on Confirm', async () => {
    const fixture = await reviewAwaitingOwner({
      result: 'fail',
      feedback: 'The screen is out of scope.',
      taskDecisions: [{ taskId: 'screen', status: 'cancelled', reason: 'Out of scope.' }],
    });
    expect(fixture.finalized).toMatchObject({ kind: 'awaiting-confirmation' });
    expect(await taskStatuses(fixture)).toEqual({ api: 'draft', screen: 'draft' });

    await confirmAgentResult(fixture.dependencies, {
      ...REVIEW,
      actor: owner,
      requestId: REQUEST_1,
    });
    expect(await taskStatuses(fixture)).toEqual({ api: 'draft', screen: 'cancelled' });
    expect(await positionOf(fixture.workflow, specification)).toEqual({
      state: 'ready',
      step: 'breakdown',
    });
  });

  it('a person’s own finish of the same result is direct', async () => {
    const { workflow } = memoryAgentDependencies(catalogue, ATTEMPT_ID);
    await runToBreakdown(workflow);
    await finishStep(workflow, {
      subject: specification,
      step: 'breakdown',
      attempt: 1,
      input: { tasks: TWO_TASKS },
      actor: claude,
    });
    await startSpecification(workflow, owner);

    const finished = await finishStep(workflow, {
      ...REVIEW,
      input: { result: 'pass' },
      actor: owner,
    });
    expect(finished.position).toEqual({ state: 'active', step: 'implementation', attempt: 1 });
    expect(await taskStatuses({ workflow })).toEqual({ api: 'ready', screen: 'ready' });
  });
});
