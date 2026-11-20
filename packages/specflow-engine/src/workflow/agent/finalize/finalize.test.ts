import { beforeAll, describe, expect, it } from 'vitest';

import type { WorkspaceExecutionIntent } from '../../../execution/model';
import type { ExecutionCatalogue } from '../../definitions/catalogue';
import { WorkflowError } from '../../errors';
import {
  SPEC,
  owner,
  positionOf,
  seedExecutionCatalogue,
  specification,
} from '../../operations/operations.test-support';
import type { AgentActor } from '../../state/model';
import { agentPostActionId } from '../journal/model';
import { memoryAgentDependencies } from '../memory.test-support';
import { proposeAgentFinish, type AgentTurnIdentity } from '../proposal/propose';
import { startAgentAttempt } from '../start';
import { finalizeAgentAttempt, type FinalizeBoundary } from './finalize';
import { recoverAgentAttempts } from './post-actions';

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
const ACTIVE = { state: 'active', step: 'requirements', attempt: 1 } as const;

const intentOf = (invocationId: string): WorkspaceExecutionIntent => ({
  operationId: invocationId,
  ownerId: 'session-a',
  binding: 'c'.repeat(64),
});
const finalizeInput = (invocationId = INVOCATION_1) => ({
  attemptId: ATTEMPT_ID,
  intent: intentOf(invocationId),
  receipt: { invocationId, process: 'stopped' as const, outcome: 'completed' as const },
});
const turn = (invocationId = INVOCATION_1): AgentTurnIdentity => ({
  attemptId: ATTEMPT_ID,
  invocationId,
  actor: writer,
  subject: specification,
  step: 'requirements',
  attempt: 1,
});

/** An agent attempt of `requirements` whose first Turn is dispatched (`proposal`: it proposed). */
async function agentTurn(options: { proposal?: boolean; phase?: 'dispatched' | 'unknown' } = {}) {
  const fixture = memoryAgentDependencies(catalogue, ATTEMPT_ID);
  const { dependencies, claims } = fixture;
  claims.set(INVOCATION_1, { phase: 'dispatched' });
  await startAgentAttempt(dependencies, {
    subject: specification,
    archetype: 'feature',
    actor: writer,
    expected: { step: 'requirements' },
    workspaceId: WORKSPACE,
    turn: { invocationId: INVOCATION_1, turnId: 'turn-1' },
  });
  if (options.proposal !== false) {
    await proposeAgentFinish(dependencies, { turn: turn(), input: {} });
  }

  // The Turn ended: its claim no longer admits its own writes.
  fixture.state.claimDispatched = false;
  claims.set(INVOCATION_1, { phase: options.phase ?? 'dispatched' });
  fixture.events.length = 0;

  return fixture;
}

/** The finishes of the attempt that reached the store. */
const finishes = (fixture: Awaited<ReturnType<typeof agentTurn>>) =>
  fixture.workflow.store.applied.filter((change) =>
    change.summary?.startsWith('finish step requirements'),
  ).length;

describe('finalizeAgentAttempt', () => {
  it('publishes the step, then settles the claim, in one lock section; post actions run after it', async () => {
    const fixture = await agentTurn();
    const { dependencies, events, state, journal } = fixture;
    const sections = state.sections;

    const result = await finalizeAgentAttempt(dependencies, finalizeInput());

    expect(result).toMatchObject({
      kind: 'finished',
      transition: 'agreed',
      finish: { transition: 'agreed' },
      postActions: [{ action: 'commit-execution-state', status: 'completed' }],
    });
    expect(events).toEqual([
      'lock',
      'store',
      'journal',
      'settle',
      'unlock',
      'post-action',
      'lock',
      'journal',
      'journal-settled',
      'unlock',
    ]);
    // The finalize section once, then the short section recording the post action done.
    expect(state.sections - sections).toBe(2);
    expect(fixture.admitted.at(-1)).toEqual({ operationId: INVOCATION_1, form: 'finalize' });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(await positionOf(fixture.workflow, specification)).not.toEqual(ACTIVE);
    expect(journal.journals.has(ATTEMPT_ID)).toBe(false);
    expect(journal.settled.get(ATTEMPT_ID)).toMatchObject({
      proposal: { state: 'finalized' },
      turns: [{ invocationId: INVOCATION_1, settledAt: expect.any(String) as unknown }],
      dirtySet: { invocationId: INVOCATION_1, paths: [{ path: 'src/a.ts' }] },
      postActions: [
        {
          kind: 'step-finished',
          operationId: agentPostActionId(ATTEMPT_ID, 'step-finished'),
          state: 'done',
          outcomes: [{ action: 'commit-execution-state', status: 'completed' }],
        },
      ],
    });
  });

  it('finalizes a Turn whose claim is unknown, and replays it without a second finish', async () => {
    const fixture = await agentTurn({ phase: 'unknown' });
    const { dependencies } = fixture;

    expect((await finalizeAgentAttempt(dependencies, finalizeInput())).kind).toBe('finished');
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    fixture.events.length = 0;

    const replayed = await finalizeAgentAttempt(dependencies, finalizeInput());
    expect(replayed).toEqual({ kind: 'finished', transition: 'agreed', postActions: [] });
    expect(finishes(fixture)).toBe(1);
    expect(fixture.events).not.toContain('store');
    expect(fixture.events).not.toContain('post-action');
  });

  it.each<FinalizeBoundary>([
    'step-published',
    'attempt-recorded',
    'claim-settled',
    'post-actions-pending',
  ])(
    'recovers a crash at %s: no duplicate finish, no settlement before it, no gap',
    async (boundary) => {
      const fixture = await agentTurn();
      const { dependencies, claims, state, events } = fixture;
      state.fault = boundary;

      await expect(finalizeAgentAttempt(dependencies, finalizeInput())).rejects.toThrow(
        `Crash at ${boundary}.`,
      );
      // The step state is published before anything else; the claim never settles before it.
      expect(finishes(fixture)).toBe(1);
      const settled = claims.get(INVOCATION_1)?.phase === 'settled';
      expect(settled).toBe(boundary === 'claim-settled' || boundary === 'post-actions-pending');
      expect(events).not.toContain('post-action');

      if (settled) {
        // Startup recovery resumes the post actions the crash left pending.
        expect(await recoverAgentAttempts(dependencies)).toEqual([
          {
            attemptId: ATTEMPT_ID,
            postActions: [{ action: 'commit-execution-state', status: 'completed' }],
          },
        ]);
      } else {
        // The claim is still held: post actions wait, the Runtime's recovery runs the same finalize.
        expect(await recoverAgentAttempts(dependencies)).toEqual([]);
        expect(events).not.toContain('post-action');
        expect((await finalizeAgentAttempt(dependencies, finalizeInput())).kind).toBe('finished');
      }

      expect(finishes(fixture)).toBe(1);
      expect(claims.get(INVOCATION_1)?.phase).toBe('settled');
      expect(events.filter((event) => event === 'post-action')).toHaveLength(1);
      expect(fixture.journal.settled.get(ATTEMPT_ID)?.postActions?.[0]?.state).toBe('done');
      expect(await recoverAgentAttempts(dependencies)).toEqual([]);
    },
  );

  it('finalizes a proposal recorded before a crash of its Turn, on recovery', async () => {
    // The proposal is recorded; the Runtime crashed before the Turn's end was finalized.
    const fixture = await agentTurn({ phase: 'unknown' });

    expect(await recoverAgentAttempts(fixture.dependencies)).toEqual([]);
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
    expect((await finalizeAgentAttempt(fixture.dependencies, finalizeInput())).kind).toBe(
      'finished',
    );
    expect(finishes(fixture)).toBe(1);
  });

  it('settles the claim on a refused re-validation and leaves the attempt active with it', async () => {
    const fixture = await agentTurn();
    const { dependencies, state, journal } = fixture;
    state.refuseStore = new WorkflowError('WORKFLOW_GATE_UNSATISFIED', 'A gate changed.');

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toEqual({
      kind: 'refused',
      of: 'proposal',
      refusal: { code: 'WORKFLOW_GATE_UNSATISFIED', message: 'A gate changed.' },
    });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
    expect(journal.journals.get(ATTEMPT_ID)).toMatchObject({
      proposal: { state: 'refused', refusal: { code: 'WORKFLOW_GATE_UNSATISFIED' } },
      turns: [{ settledAt: expect.any(String) as unknown }],
    });
    expect(journal.journals.get(ATTEMPT_ID)?.postActions).toBeUndefined();
    expect(fixture.events).not.toContain('post-action');

    // The owner continues: a new Turn proposes again and its finalize publishes it.
    fixture.claims.set(INVOCATION_2, { phase: 'dispatched' });
    state.claimDispatched = true;
    await startAgentAttempt(dependencies, {
      subject: specification,
      archetype: 'feature',
      actor: writer,
      expected: { step: 'requirements', attempt: 1 },
      workspaceId: WORKSPACE,
      turn: { invocationId: INVOCATION_2, turnId: 'turn-2' },
    });
    expect(
      (await proposeAgentFinish(dependencies, { turn: turn(INVOCATION_2), input: {} })).kind,
    ).toBe('replaced');
    expect((await finalizeAgentAttempt(dependencies, finalizeInput(INVOCATION_2))).kind).toBe(
      'finished',
    );
    // The first Turn's finalize, run again, changes nothing.
    expect((await finalizeAgentAttempt(dependencies, finalizeInput())).kind).toBe('finished');
    expect(finishes(fixture)).toBe(1);
  });

  it('settles the claim of a Turn that ended without a proposal and records its dirty set', async () => {
    const fixture = await agentTurn({ proposal: false });

    expect(await finalizeAgentAttempt(fixture.dependencies, finalizeInput())).toEqual({
      kind: 'turn-ended',
    });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
    expect(fixture.events).not.toContain('store');
    expect(fixture.journal.journals.get(ATTEMPT_ID)).toMatchObject({
      turns: [{ invocationId: INVOCATION_1, settledAt: expect.any(String) as unknown }],
      dirtySet: {
        invocationId: INVOCATION_1,
        paths: [{ path: 'src/a.ts', sha256: 'b'.repeat(64) }],
      },
    });
  });

  it("applies the owner's recorded return request once the Turn is proven stopped", async () => {
    const fixture = await agentTurn();
    const { dependencies, journal } = fixture;
    // What the owner's Return during the attempt records (T15).
    const stored = journal.journals.get(ATTEMPT_ID)!;
    journal.journals.set(ATTEMPT_ID, {
      ...stored,
      returnRequest: {
        step: 'requirements',
        feedback: 'Start again from the goals.',
        actor: owner,
        requestedAt: '2026-11-05T10:10:00.000Z',
        state: 'requested',
      },
    });

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toMatchObject({
      kind: 'returned',
    });
    const run = (await fixture.workflow.store.read(SPEC)).specification?.value.run;
    expect(run?.attempts[0]?.outcome).toMatchObject({ kind: 'returned', to: 'requirements' });
    expect(fixture.claims.get(INVOCATION_1)?.phase).toBe('settled');
    expect(journal.settled.get(ATTEMPT_ID)?.returnRequest?.state).toBe('applied');
    const applied = fixture.workflow.store.applied.length;

    expect(await finalizeAgentAttempt(dependencies, finalizeInput())).toEqual({
      kind: 'returned',
    });
    expect(fixture.workflow.store.applied).toHaveLength(applied);
    expect(finishes(fixture)).toBe(0);
  });

  it('refuses another Turn, or a Turn never dispatched, before anything changes', async () => {
    const fixture = await agentTurn();

    await expect(
      finalizeAgentAttempt(fixture.dependencies, finalizeInput(INVOCATION_2)),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    fixture.claims.set(INVOCATION_1, { phase: 'admitted' });
    await expect(finalizeAgentAttempt(fixture.dependencies, finalizeInput())).rejects.toMatchObject(
      { code: 'EXECUTION_CONFLICT' },
    );
    expect(fixture.events).toEqual(['lock', 'unlock', 'lock', 'unlock']);
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
  });
});
