import { beforeAll, describe, expect, it } from 'vitest';

import type { LedgerEntry, LedgerRecord } from '../../../specs/durable/ledger/model';
import { applyLedgerUpsert } from '../../../specs/durable/ledger/upsert';
import type { ExecutionCatalogue } from '../../definitions/catalogue';
import {
  SPEC,
  owner,
  positionOf,
  seedExecutionCatalogue,
  specification,
} from '../../operations/operations.test-support';
import type { AgentActor } from '../../state/model';
import { finalizeAgentAttempt } from '../finalize/finalize';
import { readWorkflowHistory } from '../history/workflow';
import { memoryAgentDependencies } from '../memory.test-support';
import { proposeAgentFinish, type AgentTurnIdentity } from '../proposal/propose';
import { startAgentAttempt } from '../start';
import { returnDuringAgentAttempt } from './return';
import { assertAgentTurnAdmissible, settleAbandonedAgentTurn } from './settle';
import { takeOverAgentAttempt } from './take-over';

let catalogue: ExecutionCatalogue;
beforeAll(async () => {
  catalogue = await seedExecutionCatalogue();
});

const WORKSPACE = '1f0c6a52-6a43-4c55-9d3e-1b7a5d2f8c01';
const ATTEMPT_ID = '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02';
const INVOCATION = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const writer: AgentActor = {
  class: 'agent',
  details: { archetype: 'spec-writer', provider: 'claude', sessionId: 'session-a' },
};
const turn: AgentTurnIdentity = {
  attemptId: ATTEMPT_ID,
  invocationId: INVOCATION,
  actor: writer,
  subject: specification,
  step: 'requirements',
  attempt: 1,
};
const finalizeInput = {
  attemptId: ATTEMPT_ID,
  intent: { operationId: INVOCATION, ownerId: 'session-a', binding: 'c'.repeat(64) },
  receipt: { invocationId: INVOCATION, process: 'stopped' as const, outcome: 'completed' as const },
};
const ACTIVE = { state: 'active', step: 'requirements', attempt: 1 } as const;

/**
 * An agent attempt of `requirements` whose Turn runs (its claim `phase`; `none`: the Turn is bound,
 * its Session has not admitted its claim yet).
 */
async function runningAgent(phase: 'dispatched' | 'admitted' | 'none' = 'dispatched') {
  const fixture = memoryAgentDependencies(catalogue, ATTEMPT_ID);
  if (phase !== 'none') {
    fixture.claims.set(INVOCATION, { phase });
  }

  await startAgentAttempt(fixture.dependencies, {
    subject: specification,
    archetype: 'feature',
    actor: writer,
    expected: { step: 'requirements' },
    workspaceId: WORKSPACE,
    turn: { invocationId: INVOCATION, turnId: 'turn-1' },
  });

  return fixture;
}

/** The Turn's process is proven stopped: its claim no longer admits it, the finalize runs. */
async function turnStops(fixture: Awaited<ReturnType<typeof runningAgent>>) {
  fixture.state.claimDispatched = false;

  return finalizeAgentAttempt(fixture.dependencies, finalizeInput);
}

/** The ledger entry of a document the Turn wrote and nobody committed. */
function ledgerOf(path: string, executionId: string): LedgerEntry[] {
  const record: LedgerRecord = applyLedgerUpsert(
    undefined,
    {
      projectId: 'p',
      workspaceId: WORKSPACE,
      workspaceRoot: '/r',
      owner: { kind: 'specification', id: SPEC },
    },
    {
      operationId: '00000000-0000-4000-8000-000000000001',
      reason: 'auto-commit-off',
      recordedAt: '2026-11-21T10:00:00.000Z',
      paths: [{ path, postSha256: null }],
      executionId,
      branch: 'main',
      head: null,
    },
  );

  return [...record.entries];
}

const returnInput = {
  subject: specification,
  step: 'requirements',
  feedback: 'Start again from the goals.',
  actor: owner,
};

describe("the owner's Return during an agent attempt (D19, A2)", () => {
  it('is recorded while the Turn runs, refuses a late proposal, and applies once the Turn stopped', async () => {
    const fixture = await runningAgent();

    const requested = await returnDuringAgentAttempt(fixture.dependencies, returnInput);

    expect(requested).toMatchObject({
      kind: 'return-requested',
      to: 'requirements',
      attemptId: ATTEMPT_ID,
      sessionId: 'session-a',
      turnId: 'turn-1',
    });
    // The step stays where it is: the Turn's claim is still held.
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
    expect(fixture.journal.journals.get(ATTEMPT_ID)?.returnRequest).toMatchObject({
      step: 'requirements',
      state: 'requested',
    });
    await expect(
      proposeAgentFinish(fixture.dependencies, { turn, input: {} }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });

    expect(await turnStops(fixture)).toMatchObject({ kind: 'returned' });
    const run = (await fixture.workflow.store.read(SPEC)).specification?.value.run;
    expect(run?.attempts[0]?.outcome).toMatchObject({ kind: 'returned', to: 'requirements' });
    expect(fixture.claims.get(INVOCATION)?.phase).toBe('settled');
  });

  it("applies now once the Turn's claim settled, and records it on the attempt", async () => {
    const fixture = await runningAgent();
    expect(await turnStops(fixture)).toEqual({ kind: 'turn-ended' });

    const returned = await returnDuringAgentAttempt(fixture.dependencies, returnInput);

    expect(returned).toMatchObject({ kind: 'returned', position: { state: 'ready' } });
    expect(fixture.journal.settled.get(ATTEMPT_ID)?.returnRequest).toMatchObject({
      state: 'applied',
    });
  });
});

describe('Take over (F17, D19)', () => {
  it("is refused while the agent's Turn may run", async () => {
    const fixture = await runningAgent();

    await expect(
      takeOverAgentAttempt(fixture.dependencies, {
        subject: specification,
        step: 'requirements',
        attempt: 1,
        actor: owner,
      }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_SPECIFICATION_BUSY',
      busy: { cause: 'agent-turn' },
    });
    expect(await positionOf(fixture.workflow, specification)).toEqual(ACTIVE);
  });

  it("ends the attempt taken-over, starts the owner's, refuses a late proposal, and keeps its work in the history", async () => {
    const fixture = await runningAgent();
    fixture.state.ledger = ledgerOf('specs/active/a/plan.md', INVOCATION);
    await turnStops(fixture);
    const committedBefore = fixture.state.postActionRuns.length;

    const taken = await takeOverAgentAttempt(fixture.dependencies, {
      subject: specification,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    });

    expect(taken).toMatchObject({
      takenOver: { attemptId: ATTEMPT_ID, step: 'requirements', attempt: 1 },
      context: { step: { id: 'requirements' }, attempt: 2 },
    });
    const run = (await fixture.workflow.store.read(SPEC)).specification?.value.run;
    expect(run?.attempts).toMatchObject([
      { attempt: 1, actor: writer, outcome: { kind: 'taken-over' } },
      { attempt: 2, actor: owner },
    ]);
    expect(run?.attempts[1]?.outcome).toBeUndefined();
    // Nothing of the agent's is committed by it.
    expect(fixture.state.postActionRuns).toHaveLength(committedBefore);
    expect(fixture.journal.settled.get(ATTEMPT_ID)?.takeOver).toMatchObject({
      actor: owner,
      attempt: 2,
    });
    await expect(
      proposeAgentFinish(fixture.dependencies, { turn, input: {} }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    await expect(
      takeOverAgentAttempt(fixture.dependencies, {
        subject: specification,
        step: 'requirements',
        attempt: 1,
        actor: owner,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });

    const history = await readWorkflowHistory(fixture.dependencies.workflow, specification, {
      journal: (attemptId) =>
        Promise.resolve(
          fixture.journal.journals.get(attemptId) ?? fixture.journal.settled.get(attemptId),
        ),
      ledger: (workspaceId, specId) => fixture.dependencies.ledger(workspaceId, specId),
    });
    expect(history.items).toMatchObject([
      { kind: 'attempt', step: 'requirements', attempt: 2, actor: owner },
      {
        kind: 'attempt',
        attempt: 1,
        outcome: { kind: 'taken-over' },
        agent: {
          attemptId: ATTEMPT_ID,
          ended: 'taken-over',
          takenOverBy: { attempt: 2 },
          events: [
            { kind: 'started' },
            { kind: 'turn-started', turn: 1 },
            { kind: 'turn-ended', turn: 1 },
            { kind: 'taken-over' },
          ],
          work: {
            documents: ['specs/active/a/plan.md'],
            mixed: [],
            changed: { paths: ['src/a.ts'] },
            commit: { state: 'none' },
          },
        },
      },
    ]);
    expect(history.items[0]).not.toHaveProperty('agent');
  });
});

describe('an owner action before the Turn ran (D19)', () => {
  const takeOver = (fixture: Awaited<ReturnType<typeof runningAgent>>) =>
    takeOverAgentAttempt(fixture.dependencies, {
      subject: specification,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    });

  it('refuses the admission of a Turn bound before a Take over or a Return landed', async () => {
    const taken = await runningAgent('none');
    await expect(
      assertAgentTurnAdmissible(taken.dependencies, ATTEMPT_ID, INVOCATION),
    ).resolves.toBeUndefined();
    await takeOver(taken);
    await expect(
      assertAgentTurnAdmissible(taken.dependencies, ATTEMPT_ID, INVOCATION),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });

    const returned = await runningAgent('none');
    expect(await returnDuringAgentAttempt(returned.dependencies, returnInput)).toMatchObject({
      kind: 'returned',
    });
    await expect(
      assertAgentTurnAdmissible(returned.dependencies, ATTEMPT_ID, INVOCATION),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    // Another Turn than the attempt's last one is never admitted either.
    const other = await runningAgent('none');
    await expect(
      assertAgentTurnAdmissible(other.dependencies, ATTEMPT_ID, ATTEMPT_ID),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });

  it('applies a return recorded while the claim was admitted once the claim was abandoned', async () => {
    const fixture = await runningAgent('admitted');
    expect(await returnDuringAgentAttempt(fixture.dependencies, returnInput)).toMatchObject({
      kind: 'return-requested',
    });
    // The Session abandons the admission as never dispatched: no finalize runs.
    fixture.claims.set(INVOCATION, { phase: 'settled' });

    await settleAbandonedAgentTurn(fixture.dependencies, ATTEMPT_ID);

    const run = (await fixture.workflow.store.read(SPEC)).specification?.value.run;
    expect(run?.attempts[0]?.outcome).toMatchObject({ kind: 'returned', to: 'requirements' });
    expect(fixture.journal.settled.get(ATTEMPT_ID)?.returnRequest).toMatchObject({
      state: 'applied',
    });
  });

  it('records a Take over the journal missed (a crash after the run change) at the next one', async () => {
    const fixture = await runningAgent();
    await turnStops(fixture);
    await takeOver(fixture);
    const { takeOver: _recorded, ...missed } = fixture.journal.settled.get(ATTEMPT_ID)!;
    fixture.journal.settled.delete(ATTEMPT_ID);
    fixture.journal.journals.set(ATTEMPT_ID, missed);

    await expect(takeOver(fixture)).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    expect(fixture.journal.settled.get(ATTEMPT_ID)?.takeOver).toMatchObject({ attempt: 2 });
  });
});
