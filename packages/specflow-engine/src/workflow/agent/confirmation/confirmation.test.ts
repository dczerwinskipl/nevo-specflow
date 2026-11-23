import { beforeAll, describe, expect, it } from 'vitest';

import { createDefaultDefinitionRegistry } from '../../../definitions/shipped-registry';
import { loadDefinitions } from '../../../specs/definitions/loader';
import { MemoryDefinitionSource } from '../../../specs/definitions/test-support';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../../definitions/catalogue';
import { inspectActions } from '../../operations/actions';
import { deriveAttention } from '../../operations/attention';
import { finishStep } from '../../operations/finish';
import { inspectExecution } from '../../operations/inspect';
import {
  SPEC,
  TWO_TASKS,
  claude,
  owner,
  positionOf,
  runToBreakdown,
  seedDefinitionFiles,
  seedExecutionCatalogue,
  specification,
  specificationWithTasks,
  startSpecification,
  task,
} from '../../operations/operations.test-support';
import { startTaskExecution } from '../../operations/start';
import { editTask } from '../../operations/task-resource';
import type { AgentActor } from '../../state/model';
import type { ExecutionSnapshot } from '../../state/store';
import { finalizeAgentAttempt } from '../finalize/finalize';
import { retryAgentAttemptCommit } from '../finalize/post-actions';
import { memoryAgentDependencies } from '../memory.test-support';
import { proposeAgentFinish } from '../proposal/propose';
import { startAgentAttempt } from '../start';
import { confirmAgentResult, rejectAgentResult } from './confirmation';

let catalogue: ExecutionCatalogue;
/** The seed workflows, with an exit gate on the breakdown review: a Specification `note`. */
let gated: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
  const files = await seedDefinitionFiles();
  files['workflow/specification-standard.yaml'] = (
    files['workflow/specification-standard.yaml'] ?? ''
  ).replace(
    '    purpose: No gaps or conflicts between the Specification, solution and Tasks.\n',
    [
      '    purpose: No gaps or conflicts between the Specification, solution and Tasks.',
      '    exitGates:',
      '      - type: document',
      '        documentType: note',
      '',
    ].join('\n'),
  );
  const loaded = await loadDefinitions(
    new MemoryDefinitionSource(files),
    createDefaultDefinitionRegistry(),
  );
  expect([...(loaded.invalid.get('workflow') ?? [])]).toEqual([]);
  gated = resolveExecutionCatalogue(loaded);
});

const WORKSPACE = '1f0c6a52-6a43-4c55-9d3e-1b7a5d2f8c01';
const ATTEMPT_ID = '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02';
const INVOCATION = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const ATTEMPT_2 = '4c3f9d85-9d76-4f88-8a6b-4ead8a5cbf04';
const INVOCATION_2 = '7f6ac0b8-c0a9-4cbb-9d9e-7bd0e38fe207';
const REQUEST_1 = '5d4fae96-ae87-4a99-9b7c-5fbec16dc005';
const REQUEST_2 = '6e5fbfa7-bf98-4baa-8c8d-6acfd27ed106';
const reviewer: AgentActor = {
  class: 'agent',
  details: { archetype: 'reviewer', provider: 'codex', sessionId: 'session-r' },
};
const REVIEW = { subject: specification, step: 'breakdown-review', attempt: 1 } as const;
const AWAITING = { state: 'awaiting-confirmation', step: 'breakdown-review', attempt: 1 } as const;

type MemoryFixture = ReturnType<typeof memoryAgentDependencies>;

/**
 * The breakdown drafted {@link TWO_TASKS}; an agent reviewed them and proposed `pass`, whose
 * `approve-draft-tasks` is owner authority; its Turn ended and was finalized.
 */
async function reviewAwaitingOwner(
  input: Parameters<typeof proposeAgentFinish>[1]['input'] = {
    result: 'pass',
    feedback: 'Both Tasks are ready.',
  },
  definitions: ExecutionCatalogue = catalogue,
  beforeProposal: (fixture: MemoryFixture) => void = () => undefined,
) {
  const fixture = memoryAgentDependencies(definitions, ATTEMPT_ID);
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
  beforeProposal(fixture);
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

type Fixture = Awaited<ReturnType<typeof reviewAwaitingOwner>>;

async function taskStatuses(fixture: { workflow: Parameters<typeof inspectExecution>[0] }) {
  const inspection = await inspectExecution(fixture.workflow, SPEC);

  return Object.fromEntries(
    inspection.tasks.map((entry) => [entry.record.taskId, entry.record.status]),
  );
}

/** The awaited result as the projection shows it to the owner. */
async function shown(fixture: Pick<Fixture, 'workflow'>) {
  const projection = await inspectActions(fixture.workflow, specification);
  const position = projection.position;
  if (position.kind !== 'awaiting-confirmation') {
    throw new Error(`Nothing awaits a confirmation (${position.kind}).`);
  }

  return position;
}

/** The owner's Confirm of what the projection shows now. */
async function confirmShown(fixture: Fixture, requestId = REQUEST_1) {
  const { confirmsDigest } = await shown(fixture);

  return { ...REVIEW, actor: owner, requestId, confirmsDigest };
}

describe('an agent result that waits for the owner (D17)', () => {
  it('waits for the owner, and its attempt commit ran when the attempt finished', async () => {
    const fixture = await reviewAwaitingOwner();

    expect(fixture.proposed.proposal).toMatchObject({ state: 'pending', transition: 'approved' });
    expect(fixture.finalized).toMatchObject({
      kind: 'awaiting-confirmation',
      postActions: [{ action: 'attempt-commit', status: 'completed' }],
    });
    expect(await positionOf(fixture.workflow, specification)).toEqual(AWAITING);
    expect(await taskStatuses(fixture)).toEqual({ api: 'draft', screen: 'draft' });
    // Owner decision 2026-11-21: the attempt commit runs at the finish, before the owner decides.
    expect(fixture.state.postActionRuns).toHaveLength(1);
    const journal = await fixture.dependencies.journal.read(ATTEMPT_ID);
    expect(journal).toMatchObject({
      proposal: { state: 'finalized' },
      confirmation: { state: 'pending' },
      postActions: [{ kind: 'attempt-commit', state: 'done' }],
    });
    // Still active: the owner's decision is left to record.
    expect(fixture.journal.journals.has(ATTEMPT_ID)).toBe(true);

    const position = await shown(fixture);
    expect(position.confirms).toEqual({ approvesDrafts: ['api', 'screen'] });
    expect(position.confirmsDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('asks the owner to confirm or reject it, naming the attempt', async () => {
    const fixture = await reviewAwaitingOwner();
    const snapshot = await fixture.workflow.store.read(SPEC);

    expect(deriveAttention(catalogue, snapshot)).toEqual([
      expect.objectContaining({
        subject: specification,
        reason: 'awaiting-confirmation',
        actor: 'owner',
        action: 'confirm-result',
        secondaryAction: 'reject-result',
        step: 'breakdown-review',
        stepTitle: 'Review the breakdown',
        confirmationAttempt: { step: 'breakdown-review', attempt: 1 },
      }),
    ]);
  });

  it('is applied by the owner’s Confirm as an owner write: drafts approved, no second attempt commit', async () => {
    const fixture = await reviewAwaitingOwner();
    const confirm = await confirmShown(fixture);

    const confirmed = await confirmAgentResult(fixture.dependencies, confirm);
    expect(confirmed).toMatchObject({
      transition: 'approved',
      position: { state: 'active', step: 'implementation', attempt: 1 },
      postActions: [{ action: 'commit-execution-state', status: 'completed' }],
    });
    expect(await taskStatuses(fixture)).toEqual({ api: 'ready', screen: 'ready' });
    // The attempt commit ran once, at the finish; Confirm is committed by the owner's post action.
    expect(fixture.state.postActionRuns).toHaveLength(1);
    expect(fixture.state.ownerPostActions).toEqual([
      expect.objectContaining({
        step: 'breakdown-review',
        stepTitle: 'Review the breakdown',
        attempt: 1,
        actor: owner,
        replayed: false,
      }),
    ]);
    // After the confirmation's section, never inside a lock section.
    expect(fixture.events.indexOf('owner-post-action')).toBeGreaterThan(
      fixture.events.indexOf('unlock'),
    );
    expect(fixture.events).not.toContain('owner-post-action-in-lock');
    expect(fixture.journal.settled.get(ATTEMPT_ID)?.confirmation?.state).toBe('confirmed');

    // The same request again changes nothing and runs the owner's commit again (an interrupted
    // one completes); another request is refused, saying how to finish the commit.
    const again = await confirmAgentResult(fixture.dependencies, confirm);
    expect(again).toMatchObject({
      replayed: true,
      postActions: [{ action: 'commit-execution-state' }],
    });
    expect(fixture.state.postActionRuns).toHaveLength(1);
    expect(fixture.state.ownerPostActions.at(-1)).toMatchObject({ replayed: true });
    // The request id alone names the request: what was shown is judged only when it applies.
    expect(
      await confirmAgentResult(fixture.dependencies, {
        ...confirm,
        confirmsDigest: 'e'.repeat(64),
      }),
    ).toMatchObject({ replayed: true });
    const other = confirmAgentResult(fixture.dependencies, { ...confirm, requestId: REQUEST_2 });
    await expect(other).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    await expect(other).rejects.toThrow(/confirmed already.*workflow retry-commit/su);
    await expect(
      rejectAgentResult(fixture.dependencies, { ...confirm, feedback: 'No.' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });

    // Retry commit of a confirmed attempt runs the owner's commit of the confirmation again.
    const retried = await retryAgentAttemptCommit(fixture.dependencies, {
      ...REVIEW,
      actor: owner,
    });
    expect(retried.postActions).toEqual([
      { action: 'commit-execution-state', status: 'completed' },
    ]);
  });

  it('is neither confirmed nor rejected, with Git on, until the attempt commit ran', async () => {
    const fixture = await reviewAwaitingOwner(undefined, catalogue, ({ state }) => {
      state.postActionResults = [
        {
          action: 'attempt-commit',
          status: 'failed',
          code: 'MANUAL_COMMIT_CONFLICT',
          message: 'A path changed.',
        },
      ];
    });
    const confirm = await confirmShown(fixture);
    const reject = { ...REVIEW, actor: owner, requestId: REQUEST_2, feedback: 'Not yet.' };
    const projected = async () =>
      (await inspectActions(fixture.dependencies.workflow, specification)).actions;
    const waiting = {
      ...{ step: 'breakdown-review', attempt: 1 },
      unavailable: { reason: 'attempt-commit-failed', code: 'MANUAL_COMMIT_CONFLICT' },
    };
    expect(await projected()).toMatchObject({ confirm: waiting, reject: waiting });

    await expect(confirmAgentResult(fixture.dependencies, confirm)).rejects.toMatchObject({
      code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED',
    });
    await expect(rejectAgentResult(fixture.dependencies, reject)).rejects.toMatchObject({
      code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED',
      message: expect.stringContaining('retry the commit, then reject') as string,
    });
    expect(await positionOf(fixture.workflow, specification)).toEqual(AWAITING);
    expect(fixture.state.ownerPostActions).toEqual([]);

    // Retry commit commits the agent's work; then both are available again and Confirm applies.
    fixture.state.postActionResults = [{ action: 'attempt-commit', status: 'completed' }];
    await retryAgentAttemptCommit(fixture.dependencies, { ...REVIEW, actor: owner });
    const ref = { step: 'breakdown-review', attempt: 1 };
    expect(await projected()).toMatchObject({ confirm: ref, reject: ref });
    expect((await projected()).reject).toEqual(ref);
    expect(await confirmAgentResult(fixture.dependencies, confirm)).toMatchObject({
      transition: 'approved',
    });
  });

  it('shows and refuses the decision of a Task’s agent result while its attempt commit waits', async () => {
    const files = await seedDefinitionFiles();
    files['workflow/task-standard.yaml'] = (files['workflow/task-standard.yaml'] ?? '').replace(
      '        to: { step: review }\n        continuation: auto\n',
      '        to: { step: review }\n        continuation: auto\n        confirmation: owner\n',
    );
    const loaded = await loadDefinitions(
      new MemoryDefinitionSource(files),
      createDefaultDefinitionRegistry(),
    );
    expect([...(loaded.invalid.get('workflow') ?? [])]).toEqual([]);
    const fixture = memoryAgentDependencies(resolveExecutionCatalogue(loaded), ATTEMPT_ID);
    const { dependencies, workflow, claims, state } = fixture;
    await specificationWithTasks(workflow);
    const subject = task('api');
    const implementer: AgentActor = {
      class: 'agent',
      details: { archetype: 'implementer', provider: 'codex', sessionId: 'session-r' },
    };
    claims.set(INVOCATION, { phase: 'dispatched' });
    state.postActionResults = [
      { action: 'attempt-commit', status: 'failed', code: 'MANUAL_COMMIT_CONFLICT', message: 'X.' },
    ];
    await startAgentAttempt(dependencies, {
      subject,
      archetype: 'feature',
      actor: implementer,
      expected: { step: 'implement' },
      workspaceId: WORKSPACE,
      turn: { invocationId: INVOCATION, turnId: 'turn-1' },
    });
    const turn = { subject, step: 'implement', attempt: 1 } as const;
    await proposeAgentFinish(dependencies, {
      turn: { attemptId: ATTEMPT_ID, invocationId: INVOCATION, actor: implementer, ...turn },
      input: {},
    });
    state.claimDispatched = false;
    expect(
      await finalizeAgentAttempt(dependencies, {
        attemptId: ATTEMPT_ID,
        intent: { operationId: INVOCATION, ownerId: 'session-r', binding: 'c'.repeat(64) },
        receipt: { invocationId: INVOCATION, process: 'stopped', outcome: 'completed' },
      }),
    ).toMatchObject({ kind: 'awaiting-confirmation' });

    const projection = await inspectActions(dependencies.workflow, subject);
    if (projection.position.kind !== 'awaiting-confirmation') {
      throw new Error(`Nothing awaits the owner (${projection.position.kind}).`);
    }

    const waiting = {
      step: 'implement',
      attempt: 1,
      unavailable: { reason: 'attempt-commit-failed', code: 'MANUAL_COMMIT_CONFLICT' },
    };
    expect(projection.actions.confirm).toEqual(waiting);
    expect(projection.actions.reject).toEqual(waiting);
    // The Specification's own projection names no decision of the Task's attempt.
    expect(
      (await inspectActions(dependencies.workflow, specification)).actions.confirm,
    ).toBeUndefined();
    const decision = { ...turn, actor: owner, requestId: REQUEST_1 };
    await expect(
      confirmAgentResult(dependencies, {
        ...decision,
        confirmsDigest: projection.position.confirmsDigest,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
    await expect(
      rejectAgentResult(dependencies, { ...decision, requestId: REQUEST_2, feedback: 'Not yet.' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  });

  it('is confirmed with Git off whatever the attempt commit reported', async () => {
    const fixture = await reviewAwaitingOwner(undefined, catalogue, ({ state }) => {
      state.gitEnabled = false;
      state.postActionResults = [
        { action: 'attempt-commit', status: 'failed', code: 'X', message: 'Failed.' },
      ];
    });

    expect(
      (await inspectActions(fixture.dependencies.workflow, specification)).actions.confirm,
    ).toEqual({ step: 'breakdown-review', attempt: 1 });
    expect(
      await confirmAgentResult(fixture.dependencies, await confirmShown(fixture)),
    ).toMatchObject({ transition: 'approved' });
  });

  it('is refused when a draft or its task.md changed since the owner was shown it', async () => {
    const fixture = await reviewAwaitingOwner();
    const documents = fixture.workflow.references.taskDocuments;
    documents.set('screen', [{ path: 'task.md', revision: 'a'.repeat(64) }]);
    const confirm = await confirmShown(fixture);
    const expectRefused = async (shownBefore: typeof confirm) => {
      const refused = confirmAgentResult(fixture.dependencies, shownBefore);
      await expect(refused).rejects.toMatchObject({ code: 'WORKFLOW_CONFIRMATION_CHANGED' });
      await expect(refused).rejects.toThrow(/approves the drafts api, screen as they are now/u);
      expect(await positionOf(fixture.workflow, specification)).toEqual(AWAITING);
      expect(await taskStatuses(fixture)).toEqual({ api: 'draft', screen: 'draft' });
      expect((await shown(fixture)).confirmsDigest).not.toBe(shownBefore.confirmsDigest);
    };

    // The draft's task.md was edited after the owner read the result.
    documents.set('screen', [{ path: 'task.md', revision: 'b'.repeat(64) }]);
    await expectRefused(confirm);

    // So was its manifest, after the owner read it again.
    const again = await confirmShown(fixture);
    const projection = await inspectActions(fixture.workflow, task('screen'));
    await editTask(fixture.workflow, {
      specId: SPEC,
      taskId: 'screen',
      expectedRevision: projection.task?.revision ?? '',
      title: 'Screen, edited after the review',
      actor: owner,
    });
    await expectRefused(again);

    // What the owner reads now is what Confirm applies.
    await confirmAgentResult(fixture.dependencies, await confirmShown(fixture));
    expect(await taskStatuses(fixture)).toEqual({ api: 'ready', screen: 'ready' });
  });

  it('stays waiting, with the reasons, when an exit gate no longer holds at Confirm', async () => {
    const fixture = await reviewAwaitingOwner(undefined, gated, ({ workflow }) => {
      workflow.references.gateDocuments.push({ type: 'note', id: 'review', present: true });
    });
    expect(fixture.finalized).toMatchObject({ kind: 'awaiting-confirmation' });
    const confirm = await confirmShown(fixture);
    fixture.workflow.references.gateDocuments.length = 0;

    await expect(confirmAgentResult(fixture.dependencies, confirm)).rejects.toMatchObject({
      code: 'WORKFLOW_GATE_UNSATISFIED',
    });
    expect(await positionOf(fixture.workflow, specification)).toEqual(AWAITING);
    expect(await taskStatuses(fixture)).toEqual({ api: 'draft', screen: 'draft' });
    const position = await shown(fixture);
    expect(position.proposal.transition.gates).toEqual([
      expect.objectContaining({ type: 'document', status: 'unsatisfied' }),
    ]);
    expect(fixture.state.ownerPostActions).toEqual([]);
  });

  it('goes back to the step on the owner’s Reject; the next agent attempt starts clean', async () => {
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
    // The agent's work was committed when its attempt finished; nothing of it is left to run.
    expect(fixture.state.postActionRuns).toHaveLength(1);
    expect(fixture.journal.settled.get(ATTEMPT_ID)).toMatchObject({
      confirmation: { state: 'rejected' },
      postActions: [{ kind: 'attempt-commit', state: 'done' }],
    });
    expect(fixture.journal.journals.size).toBe(0);

    // The next attempt reads the owner's feedback first.
    const inspection = await inspectExecution(fixture.workflow, SPEC);
    expect(inspection.specification?.handoff).toEqual({
      kind: 'return',
      at: expect.any(String) as unknown,
      feedback: 'Split the screen Task.',
    });
    expect((await rejectAgentResult(fixture.dependencies, reject)).replayed).toBe(true);

    // A new agent attempt of the step starts.
    fixture.claims.set(INVOCATION_2, { phase: 'dispatched' });
    fixture.state.claimDispatched = true;
    await startAgentAttempt(
      { ...fixture.dependencies, newId: () => ATTEMPT_2 },
      {
        subject: specification,
        archetype: 'feature',
        actor: reviewer,
        expected: { step: 'breakdown-review' },
        workspaceId: WORKSPACE,
        turn: { invocationId: INVOCATION_2, turnId: 'turn-2' },
      },
    );
    expect(await positionOf(fixture.workflow, specification)).toEqual({
      state: 'active',
      step: 'breakdown-review',
      attempt: 2,
    });
  });

  it('is decided only by the owner, and only while it waits', async () => {
    const fixture = await reviewAwaitingOwner();
    const decide = await confirmShown(fixture);

    await expect(
      confirmAgentResult(fixture.dependencies, { ...decide, actor: reviewer as never }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED' });
    await expect(
      confirmAgentResult(fixture.dependencies, { ...decide, step: 'breakdown' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    await expect(
      confirmAgentResult(fixture.dependencies, { ...decide, confirmsDigest: 'not-a-digest' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
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
    expect((await shown(fixture)).confirms).toEqual({
      taskDecisions: [{ taskId: 'screen', status: 'cancelled', reason: 'Out of scope.' }],
    });

    await confirmAgentResult(fixture.dependencies, await confirmShown(fixture));
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

/** The snapshot with the Task's active attempt ended into a result that waits (as a finalize leaves it). */
function awaitingTask(snapshot: ExecutionSnapshot, taskId: string): ExecutionSnapshot {
  return {
    ...snapshot,
    runs: snapshot.runs.map((record) => {
      const run = record.value.run;
      if (record.value.taskId !== taskId || run.position.state !== 'active') {
        return record;
      }

      const { step, attempt } = run.position;

      return {
        ...record,
        value: {
          ...record.value,
          run: {
            ...run,
            position: { state: 'awaiting-confirmation', step, attempt },
            attempts: run.attempts.map((entry) =>
              entry.step === step && entry.attempt === attempt
                ? {
                    ...entry,
                    endedAt: '2026-11-21T10:00:00.000Z',
                    finishedBy: claude,
                    outcome: { kind: 'transition', transition: 'implemented', artifacts: [] },
                    confirmation: { state: 'pending' },
                  }
                : entry,
            ),
          },
        },
      };
    }),
  };
}

describe('the attention of a Task whose agent result waits for the owner', () => {
  it('asks the owner to confirm or reject it on the Task', async () => {
    const { workflow } = memoryAgentDependencies(catalogue, ATTEMPT_ID);
    await specificationWithTasks(workflow);
    await startTaskExecution(workflow, { specId: SPEC, taskId: 'api', actor: claude });

    const items = deriveAttention(catalogue, awaitingTask(await workflow.store.read(SPEC), 'api'));
    expect(items).toEqual([
      expect.objectContaining({
        subject: task('api'),
        reason: 'awaiting-confirmation',
        action: 'confirm-result',
        secondaryAction: 'reject-result',
        stepTitle: 'Implement',
        confirmationAttempt: { step: 'implement', attempt: 1 },
      }),
    ]);
  });
});
