import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { finishStep } from '../operations/finish';
import {
  SPEC,
  TWO_TASKS,
  agent,
  claude,
  positionOf,
  runToBreakdown,
  seedExecutionCatalogue,
  specification,
  startSpecification,
} from '../operations/operations.test-support';
import type { WorkflowDependencies } from '../operations/loaded-execution';
import type { AgentActor } from '../state/model';
import { memoryAgentDependencies } from './memory.test-support';
import { proposeAgentFinish, readAgentAttempt, type AgentTurnIdentity } from './proposal/propose';
import { startAgentAttempt, type StartAgentAttemptInput } from './start';

let catalogue: ExecutionCatalogue;

beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

const WORKSPACE = '1f0c6a52-6a43-4c55-9d3e-1b7a5d2f8c01';
const ATTEMPT_ID = '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02';
const INVOCATION_1 = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const INVOCATION_2 = '4c3f9d85-9d76-4f88-8a6b-4eadb05cbf04';
const writer: AgentActor = {
  class: 'agent',
  details: { archetype: 'spec-writer', provider: 'claude', sessionId: 'session-a' },
};

const ACTIVE_REQUIREMENTS = { state: 'active', step: 'requirements', attempt: 1 } as const;

/** The agent attempt operations over in-memory state; `state.claimDispatched` decides the Turn's admission. */
function agentDependencies() {
  return memoryAgentDependencies(catalogue, ATTEMPT_ID);
}

/** Runs the Specification until its breakdown proposed {@link TWO_TASKS}: the review is next. */
async function specificationWithDrafts(workflow: WorkflowDependencies) {
  await runToBreakdown(workflow);
  await finishStep(workflow, {
    subject: specification,
    step: 'breakdown',
    attempt: 1,
    input: { tasks: TWO_TASKS },
    actor: claude,
  });
}

const startInput = (overrides: Partial<StartAgentAttemptInput> = {}): StartAgentAttemptInput => ({
  subject: specification,
  archetype: 'feature',
  actor: writer,
  expected: { step: 'requirements' },
  workspaceId: WORKSPACE,
  turn: { invocationId: INVOCATION_1, turnId: 'turn-1' },
  ...overrides,
});

const turnOf = (overrides: Partial<AgentTurnIdentity> = {}): AgentTurnIdentity => ({
  attemptId: ATTEMPT_ID,
  invocationId: INVOCATION_1,
  actor: writer,
  subject: specification,
  step: 'requirements',
  attempt: 1,
  ...overrides,
});

describe('agent attempt start', () => {
  it('records the binding on the attempt and the Turn in the journal', async () => {
    const { dependencies, workflow } = agentDependencies();
    const started = await startAgentAttempt(
      dependencies,
      startInput({ contextDigest: 'a'.repeat(64) }),
    );

    expect(started).toMatchObject({
      kind: 'started',
      binding: {
        kind: 'agent-attempt',
        attemptId: ATTEMPT_ID,
        workspaceId: WORKSPACE,
        contextDigest: 'a'.repeat(64),
      },
    });
    const run = (await workflow.store.read(SPEC)).specification?.value.run;
    expect(run?.attempts[0]?.hostData).toEqual(started.binding);
    expect(await readAgentAttempt(dependencies, ATTEMPT_ID)).toMatchObject({
      step: 'requirements',
      attempt: 1,
      workspaceId: WORKSPACE,
      turns: [{ invocationId: INVOCATION_1, turnId: 'turn-1' }],
    });
  });

  it.each<[string, Partial<StartAgentAttemptInput>, boolean, string]>([
    ['another step', { expected: { step: 'specification' } }, false, 'WORKFLOW_ATTEMPT_MISMATCH'],
    [
      'a Continue with nothing active',
      { expected: { step: 'requirements', attempt: 1 } },
      false,
      'WORKFLOW_ATTEMPT_MISMATCH',
    ],
    ['a new attempt while one is active', {}, true, 'WORKFLOW_ATTEMPT_MISMATCH'],
    [
      'a Continue of another attempt',
      { expected: { step: 'requirements', attempt: 2 } },
      true,
      'WORKFLOW_ATTEMPT_MISMATCH',
    ],
    [
      'a Continue by another Session',
      {
        expected: { step: 'requirements', attempt: 1 },
        actor: { ...writer, details: { ...writer.details, sessionId: 'session-b' } },
        turn: { invocationId: INVOCATION_2, turnId: 'turn-2' },
      },
      true,
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    ],
    [
      'a Continue in another checkout',
      {
        expected: { step: 'requirements', attempt: 1 },
        workspaceId: '5d4a0e96-0e87-4a99-9b7c-5fbec16dc005',
        turn: { invocationId: INVOCATION_2, turnId: 'turn-2' },
      },
      true,
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    ],
    [
      'an agent without a Session',
      { actor: { class: 'agent', details: { provider: 'claude' } } },
      false,
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    ],
  ])('refuses %s before anything changes', async (_name, overrides, active, code) => {
    const { dependencies, workflow, journal } = agentDependencies();
    if (active) {
      await startAgentAttempt(dependencies, startInput());
    }

    const before = structuredClone([...journal.journals.values()]);
    const position = await positionOf(workflow, specification);
    await expect(startAgentAttempt(dependencies, startInput(overrides))).rejects.toMatchObject({
      code,
    });
    expect([...journal.journals.values()]).toEqual(before);
    expect(await positionOf(workflow, specification)).toEqual(position);
  });

  it('continues the active attempt with a new Turn, and a retried start binds nothing new', async () => {
    const { dependencies } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());
    const next = startInput({
      expected: { step: 'requirements', attempt: 1 },
      turn: { invocationId: INVOCATION_2, turnId: 'turn-2' },
    });

    expect((await startAgentAttempt(dependencies, next)).kind).toBe('resumed');
    await startAgentAttempt(dependencies, next);
    expect((await readAgentAttempt(dependencies, ATTEMPT_ID))?.turns).toMatchObject([
      { invocationId: INVOCATION_1 },
      { invocationId: INVOCATION_2 },
    ]);
    await expect(
      startAgentAttempt(dependencies, {
        ...next,
        turn: { invocationId: INVOCATION_1, turnId: 'turn-1' },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });

  it('does not advance the Run when a Turn ends without a proposal', async () => {
    const { dependencies, workflow, state } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());
    // The Turn ends: its claim is no longer dispatched, and the owner continues the attempt.
    state.claimDispatched = false;
    expect(await positionOf(workflow, specification)).toEqual({
      state: 'active',
      step: 'requirements',
      attempt: 1,
    });
    state.claimDispatched = true;
    await startAgentAttempt(
      dependencies,
      startInput({
        expected: { step: 'requirements', attempt: 1 },
        turn: { invocationId: INVOCATION_2, turnId: 'turn-2' },
      }),
    );

    expect(await positionOf(workflow, specification)).toEqual({
      state: 'active',
      step: 'requirements',
      attempt: 1,
    });
    expect((await readAgentAttempt(dependencies, ATTEMPT_ID))?.proposal).toBeUndefined();
    // The ended Turn cannot submit a proposal late.
    await expect(
      proposeAgentFinish(dependencies, { turn: turnOf(), input: {} }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });
});

describe('agent finish proposal', () => {
  it('is recorded without moving the Run, replayed, and replaced while not finalized', async () => {
    const { dependencies, workflow, journal } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());

    const recorded = await proposeAgentFinish(dependencies, { turn: turnOf(), input: {} });
    expect(recorded).toMatchObject({
      kind: 'recorded',
      proposal: {
        transition: 'agreed',
        state: 'pending',
        invocationId: INVOCATION_1,
        actor: writer,
      },
    });
    expect(recorded.proposal.requestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(await positionOf(workflow, specification)).toEqual({
      state: 'active',
      step: 'requirements',
      attempt: 1,
    });

    const replayed = await proposeAgentFinish(dependencies, { turn: turnOf(), input: {} });
    expect(replayed).toEqual({ kind: 'replayed', proposal: recorded.proposal });

    const replaced = await proposeAgentFinish(dependencies, {
      turn: turnOf(),
      input: { feedback: 'Scope agreed with the owner.' },
    });
    expect(replaced.kind).toBe('replaced');
    expect(replaced.proposal.requestDigest).not.toBe(recorded.proposal.requestDigest);

    // Once finalized, only the same proposal is answered; another one is stale.
    const stored = journal.journals.get(ATTEMPT_ID)!;
    journal.journals.set(ATTEMPT_ID, {
      ...stored,
      proposal: { ...stored.proposal!, state: 'finalized' },
    });
    await expect(
      proposeAgentFinish(dependencies, { turn: turnOf(), input: {} }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    expect(
      (
        await proposeAgentFinish(dependencies, {
          turn: turnOf(),
          input: { feedback: 'Scope agreed with the owner.' },
        })
      ).kind,
    ).toBe('replayed');
  });

  it.each<[string, Partial<AgentTurnIdentity>, Record<string, unknown>, string]>([
    ['an illegal result', {}, { result: 'pass' }, 'WORKFLOW_INPUT_INVALID'],
    [
      'Task decisions',
      {},
      { taskDecisions: [{ taskId: 'api', status: 'ready' }] },
      'WORKFLOW_OWNER_DECISION_REQUIRED',
    ],
    ['another attempt', { attempt: 2 }, {}, 'WORKFLOW_ATTEMPT_MISMATCH'],
    ['a Turn that was replaced', { invocationId: INVOCATION_2 }, {}, 'WORKFLOW_ATTEMPT_MISMATCH'],
    [
      'another actor than the one of the attempt',
      { actor: { ...writer, details: { ...writer.details, model: 'other-model' } } },
      {},
      'WORKFLOW_ATTEMPT_MISMATCH',
    ],
  ])('refuses %s and records nothing', async (_name, turn, input, code) => {
    const { dependencies, workflow } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());

    await expect(
      proposeAgentFinish(dependencies, { turn: turnOf(turn), input }),
    ).rejects.toMatchObject({ code });
    expect((await readAgentAttempt(dependencies, ATTEMPT_ID))?.proposal).toBeUndefined();
    expect(await positionOf(workflow, specification)).toEqual(ACTIVE_REQUIREMENTS);
  });

  it('keeps the pending proposal when a replacement is refused', async () => {
    const { dependencies, workflow } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());
    const { proposal } = await proposeAgentFinish(dependencies, { turn: turnOf(), input: {} });

    await expect(
      proposeAgentFinish(dependencies, { turn: turnOf(), input: { result: 'pass' } }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect((await readAgentAttempt(dependencies, ATTEMPT_ID))?.proposal).toEqual(proposal);
    expect(await positionOf(workflow, specification)).toEqual(ACTIVE_REQUIREMENTS);
  });

  it('judges the same input again after its finalize refused it', async () => {
    const { dependencies, journal } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());
    const { proposal } = await proposeAgentFinish(dependencies, { turn: turnOf(), input: {} });
    journal.journals.set(ATTEMPT_ID, {
      ...journal.journals.get(ATTEMPT_ID)!,
      proposal: {
        ...proposal,
        state: 'refused',
        refusal: { code: 'WORKFLOW_GATE_UNSATISFIED', message: 'A gate changed.' },
      },
    });

    const again = await proposeAgentFinish(dependencies, { turn: turnOf(), input: {} });
    expect(again.kind).toBe('replaced');
    expect(again.proposal).toMatchObject({
      state: 'pending',
      requestDigest: proposal.requestDigest,
    });
    expect(again.proposal.refusal).toBeUndefined();
  });

  it('refuses a plain agent finish of an Ask agent attempt, but not the proposal', async () => {
    const { dependencies, workflow } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());

    await expect(
      finishStep(workflow, {
        subject: specification,
        step: 'requirements',
        attempt: 1,
        input: {},
        actor: writer,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_EXECUTOR_NOT_ALLOWED' });
    expect(await positionOf(workflow, specification)).toEqual(ACTIVE_REQUIREMENTS);
    expect((await proposeAgentFinish(dependencies, { turn: turnOf(), input: {} })).kind).toBe(
      'recorded',
    );
  });

  it('is refused while the Turn claim is not dispatched (a late callback)', async () => {
    const { dependencies, admitted, state } = agentDependencies();
    await startAgentAttempt(dependencies, startInput());
    state.claimDispatched = false;

    await expect(
      proposeAgentFinish(dependencies, { turn: turnOf(), input: {} }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_SPECIFICATION_BUSY' });
    expect(admitted.at(-1)).toEqual({ operationId: INVOCATION_1, form: 'turn' });
  });

  it('refuses an owner-authority transition in any agent finish, not only a proposal', async () => {
    const { workflow } = agentDependencies();
    await specificationWithDrafts(workflow);
    const reviewer = agent('codex', 'session-r', 'x');
    await startSpecification(workflow, reviewer);
    const before = await positionOf(workflow, specification);

    await expect(
      finishStep(workflow, {
        subject: specification,
        step: 'breakdown-review',
        attempt: 1,
        input: { result: 'pass' },
        actor: reviewer,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_OWNER_DECISION_REQUIRED' });
    expect(await positionOf(workflow, specification)).toEqual(before);
  });

  it('refuses a transition with an owner-authority effect', async () => {
    const { dependencies, workflow } = agentDependencies();
    await specificationWithDrafts(workflow);
    const reviewer: AgentActor = {
      class: 'agent',
      details: { archetype: 'reviewer', provider: 'codex', sessionId: 'session-r' },
    };
    await startAgentAttempt(
      dependencies,
      startInput({ actor: reviewer, expected: { step: 'breakdown-review' } }),
    );
    const turn = turnOf({ actor: reviewer, step: 'breakdown-review' });

    await expect(
      proposeAgentFinish(dependencies, { turn, input: { result: 'pass' } }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_OWNER_DECISION_REQUIRED' });
    // A result the agent may take is recorded.
    expect(
      (
        await proposeAgentFinish(dependencies, {
          turn,
          input: { result: 'fail', feedback: 'The screen Task has no acceptance.' },
        })
      ).proposal.transition,
    ).toBe('changes-requested');
  });
});
