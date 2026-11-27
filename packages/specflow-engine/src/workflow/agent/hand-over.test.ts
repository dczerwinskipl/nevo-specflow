import { beforeAll, describe, expect, it } from 'vitest';

import type { ExecutionCatalogue } from '../definitions/catalogue';
import { inspectActions } from '../operations/actions';
import {
  SPEC,
  owner,
  positionOf,
  seedExecutionCatalogue,
  specification,
  startSpecification,
} from '../operations/operations.test-support';
import type { AgentActor } from '../state/model';
import type { AttributionFacts } from './boundary/attribution';
import { readWorkflowHistory } from './history/workflow';
import { memoryAgentDependencies } from './memory.test-support';
import { startAgentAttempt } from './start';

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
const STATE = 'specs/active/a/.execution/run.yaml';

/** The owner holds attempt 1 of `requirements` (Start step). */
async function ownerHolds() {
  const fixture = memoryAgentDependencies(catalogue, ATTEMPT_ID);
  await startSpecification(fixture.workflow, owner);

  return fixture;
}

const hand = (fixture: Awaited<ReturnType<typeof ownerHolds>>) =>
  startAgentAttempt(fixture.dependencies, {
    subject: specification,
    archetype: 'feature',
    actor: writer,
    expected: { step: 'requirements', attempt: 1, handOver: true },
    workspaceId: WORKSPACE,
    turn: { invocationId: INVOCATION, turnId: 'turn-1' },
    launch: { session: 'fresh' },
  });

/** A dirty path the Engine wrote (its post-image is the path's bytes now). */
const engineWritten = (path: string) => ({
  path,
  sha256: 'a'.repeat(64),
  added: false,
  area: { kind: 'specification' as const, registered: true },
  engine: [
    {
      sha256: 'a'.repeat(64),
      source: 'ledger' as const,
      operationIds: ['op'],
      operationCount: 1,
      executions: [],
      latest: true,
    },
  ],
});

describe('Hand to agent', () => {
  it("is offered on the owner's attempt of a step an agent may do", async () => {
    const fixture = await ownerHolds();

    const projection = await inspectActions(fixture.dependencies.workflow, specification);

    expect(projection.actions.handToAgent).toMatchObject({
      step: 'requirements',
      attempt: 1,
      agent: { kind: 'available', launch: { session: { mode: 'fresh' } } },
    });
  });

  it("ends the owner's attempt handed to the agent and starts the agent's next attempt", async () => {
    const fixture = await ownerHolds();
    fixture.state.ownerWorkflowState = [STATE];
    fixture.state.attribution = { paths: [engineWritten(STATE)], incomplete: false };
    // The owner's commit takes the owner's workflow state before the agent's attempt starts.
    const postActions = fixture.dependencies.workflow.postActions!;
    const commit = postActions.afterOwnerChange!.bind(postActions);
    Object.assign(postActions, {
      afterOwnerChange: (event: Parameters<typeof commit>[0]) => {
        fixture.state.ownerWorkflowState = [];
        fixture.state.attribution = { paths: [], incomplete: false };

        return commit(event);
      },
    });

    const started = await hand(fixture);

    expect(started).toMatchObject({
      kind: 'started',
      context: { step: { id: 'requirements' }, attempt: 2 },
      binding: { attemptId: ATTEMPT_ID, workspaceId: WORKSPACE, launch: { session: 'fresh' } },
    });
    const run = (await fixture.workflow.store.read(SPEC)).specification?.value.run;
    expect(run?.attempts).toMatchObject([
      { attempt: 1, actor: owner, outcome: { kind: 'taken-over' } },
      { attempt: 2, actor: writer },
    ]);
    expect(await positionOf(fixture.workflow, specification)).toEqual({
      state: 'active',
      step: 'requirements',
      attempt: 2,
    });
    expect(fixture.state.ownerChanges).toHaveLength(1);
    expect(fixture.journal.journals.get(ATTEMPT_ID)).toMatchObject({
      step: 'requirements',
      attempt: 2,
      turns: [{ invocationId: INVOCATION, turnId: 'turn-1' }],
    });

    const projection = await inspectActions(fixture.dependencies.workflow, specification);
    expect(projection.position).toMatchObject({
      kind: 'active',
      attempt: { number: 2, handedOverFrom: { attempt: 1 } },
    });
    expect(projection.position).not.toHaveProperty('attempt.takenOverFrom');
    expect(projection.actions.handToAgent).toBeUndefined();
    const history = await readWorkflowHistory(fixture.dependencies.workflow, specification, {
      journal: (attemptId) => Promise.resolve(fixture.journal.journals.get(attemptId)),
      ledger: () => Promise.resolve([]),
    });
    expect(history.items).toMatchObject([
      {
        attempt: 2,
        agent: {
          handedOverFrom: { attempt: 1 },
          events: [{ kind: 'handed-over' }, { kind: 'turn-started', turn: 1 }],
        },
      },
      { attempt: 1, actor: owner, outcome: { kind: 'taken-over' } },
    ]);
  });

  it('refuses while the owner has uncommitted work, before anything is written or committed', async () => {
    const fixture = await ownerHolds();
    const facts: AttributionFacts = {
      paths: [
        engineWritten(STATE),
        engineWritten('specs/active/a/plan.md'),
        { path: 'src/a.ts', sha256: 'b'.repeat(64), added: false, area: { kind: 'code' } },
      ],
      incomplete: false,
    };
    fixture.state.ownerWorkflowState = [STATE];
    fixture.state.attribution = facts;
    const before = await fixture.workflow.store.read(SPEC);

    await expect(hand(fixture)).rejects.toMatchObject({
      code: 'WORKFLOW_OWNER_WORK_UNCOMMITTED',
      attribution: { paths: ['specs/active/a/plan.md', 'src/a.ts'], count: 2 },
    });
    expect(fixture.state.ownerChanges).toHaveLength(0);
    expect(fixture.journal.journals.size).toBe(0);
    expect((await fixture.workflow.store.read(SPEC)).specification?.revision).toBe(
      before.specification?.revision,
    );
  });

  it("refuses an agent's attempt and a stale position", async () => {
    const fixture = await ownerHolds();

    await expect(
      startAgentAttempt(fixture.dependencies, {
        subject: specification,
        archetype: 'feature',
        actor: writer,
        expected: { step: 'requirements', attempt: 2, handOver: true },
        workspaceId: WORKSPACE,
        turn: { invocationId: INVOCATION, turnId: 'turn-1' },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });

    await hand(fixture);
    await expect(
      startAgentAttempt(fixture.dependencies, {
        subject: specification,
        archetype: 'feature',
        actor: writer,
        expected: { step: 'requirements', attempt: 2, handOver: true },
        workspaceId: WORKSPACE,
        turn: { invocationId: ATTEMPT_ID, turnId: 'turn-2' },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });
});
