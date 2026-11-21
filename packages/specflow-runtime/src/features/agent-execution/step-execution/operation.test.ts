import type { ActionProjection, AgentAttemptJournal, WorkflowSubject } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import type { ActiveAgentAttempt, AgentStepEngine } from './engine-port';
import { createAgentStepExecution, derivedId, type AgentStepSessions } from './operation';

const SPEC = 'spec-1';
const subject: WorkflowSubject = { kind: 'specification', specId: SPEC };
const ATTEMPT = '00000000-0000-4000-8000-0000000000a1';
const WORKSPACE = '00000000-0000-4000-8000-0000000000b1';
const launch = {
  archetype: 'task-planner',
  provider: 'controlled',
  model: 'm',
  session: { mode: 'fresh' as const },
};
const ready: ActionProjection = {
  subject,
  position: {
    kind: 'ready',
    next: {
      step: { id: 'breakdown', title: 'Break it down' },
      human: true,
      agent: { kind: 'available', launch },
    },
  },
  actions: {},
} as unknown as ActionProjection;
const active: ActionProjection = {
  subject,
  position: {
    kind: 'active',
    step: { id: 'breakdown', title: 'Break it down' },
    attempt: { number: 1, startedAt: 't', actor: { class: 'agent', details: { provider: 'x' } } },
    exits: [],
  },
  actions: {},
} as unknown as ActionProjection;

/**
 * A fake Engine: `start` records the attempt the way the Engine's journal does (one Turn per
 * invocation), so a retry of the same request finds it.
 */
function fakes(
  options: { failFirstTurnStart?: boolean; refuseStart?: boolean; failFirstCreate?: boolean } = {},
) {
  const created = new Set<string>();
  let failCreate = options.failFirstCreate === true;
  const calls: string[] = [];
  let attempt: ActiveAgentAttempt | undefined;
  const turns = new Set<string>();
  let failTurnStart = options.failFirstTurnStart === true;
  const engine: AgentStepEngine = {
    actions: () => Promise.resolve(attempt ? active : ready),
    activeAttempt: () => Promise.resolve(attempt),
    claimPhase: () => Promise.resolve('settled'),
    busyWriter: () => Promise.resolve(undefined),
    archetypeAllowlist: () => Promise.resolve(undefined),
    workspaceIdOf: () => Promise.resolve(WORKSPACE),
    baseline: () => {
      calls.push('baseline');

      return Promise.resolve(undefined);
    },
    start(input) {
      calls.push(`engine.start ${input.expected.attempt === undefined ? 'new' : 'continue'}`);
      if (options.refuseStart) {
        return Promise.reject(new Error('refused'));
      }

      const turn = { ...input.turn, boundAt: 't' };
      const journal = (attempt?.journal ?? {
        operationId: ATTEMPT,
        subject,
        step: 'breakdown',
        attempt: 1,
        actor: input.actor,
        workspaceId: WORKSPACE,
        turns: [],
      }) as unknown as AgentAttemptJournal;
      attempt = {
        attemptId: ATTEMPT,
        workspaceId: WORKSPACE,
        step: 'breakdown',
        attempt: 1,
        ...(input.launch
          ? { launch: input.launch }
          : attempt?.launch
            ? { launch: attempt.launch }
            : {}),
        journal: {
          ...journal,
          turns: [...journal.turns, { ...turn, finalizedAt: 't2' }],
        },
      };

      return Promise.resolve({ attemptId: ATTEMPT });
    },
    brief: () =>
      Promise.resolve({ step: { id: 'breakdown', title: 'Break it down' }, attempt: 1, text: 'b' }),
    work: () =>
      Promise.resolve({
        documents: [],
        mixed: [],
        tasks: [],
        declared: [],
        commit: { state: 'none' },
      }),
    returnStep: (input) =>
      Promise.resolve({
        kind: 'return-requested',
        subject: input.subject,
        to: input.step,
        attemptId: ATTEMPT,
        step: 'breakdown',
        attempt: 1,
        sessionId: attempt?.journal.actor.details.sessionId ?? '',
        turnId: attempt?.journal.turns.at(-1)?.turnId ?? '',
        requestedAt: 't3',
      }),
    takeOver: () => Promise.reject(new Error('not used')),
  };
  const sessions: AgentStepSessions = {
    available: () => true,
    provider: () => undefined,
    create(_actor, input, _association, chosen) {
      calls.push(`session.create ${input.requestId}`);
      if (failCreate) {
        failCreate = false;

        return Promise.reject(new Error('create failed'));
      }

      created.add(chosen!.sessionId!);

      return Promise.resolve({ sessionId: chosen!.sessionId! });
    },
    start(_actor, sessionId, _input, turnOptions) {
      calls.push(`session.start ${sessionId}`);
      if (failTurnStart) {
        failTurnStart = false;

        return Promise.reject(new Error('lost'));
      }

      turns.add(turnOptions!.ids!.turnId);

      return Promise.resolve({ turnId: turnOptions!.ids!.turnId });
    },
    cancel(_actor, sessionId, turnId) {
      calls.push(`session.cancel ${sessionId} ${turnId}`);

      return Promise.resolve({ turnId });
    },
    snapshot: () => Promise.resolve({ activeTurn: undefined } as never),
    associateTasks: () => Promise.resolve(),
    hasSession: (sessionId) => Promise.resolve(created.has(sessionId)),
    hasTurn: (_sessionId, turnId) => Promise.resolve(turns.has(turnId)),
  };

  return {
    calls,
    execution: createAgentStepExecution({ engine, sessions: () => sessions }),
    attempt: () => attempt,
  };
}

const request = (requestId: string, overrides: { attempt?: number } = {}) => ({
  subject,
  principal: 'owner',
  requestId,
  expected: {
    step: 'breakdown',
    ...(overrides.attempt !== undefined ? { attempt: overrides.attempt } : {}),
  },
});

describe('agent step execution', () => {
  it('creates the fresh Session only after the Engine admitted the start, with the id the actor names', async () => {
    const { calls, execution, attempt } = fakes();
    const id = '00000000-0000-4000-8000-000000000001';

    const result = await execution.startAgentStepExecution(request(id));

    expect(calls).toEqual([
      'baseline',
      'engine.start new',
      `session.create ${derivedId(ATTEMPT, 'session-request')}`,
      `session.start ${derivedId(id, 'session')}`,
    ]);
    expect(result).toMatchObject({
      kind: 'started',
      session: 'fresh',
      sessionId: derivedId(id, 'session'),
    });
    expect(attempt()?.journal.actor.details.sessionId).toBe(derivedId(id, 'session'));
    expect(attempt()?.launch).toEqual({ session: 'fresh' });
  });

  it('leaves no Session when the Engine refuses the start', async () => {
    const { calls, execution } = fakes({ refuseStart: true });

    await expect(
      execution.startAgentStepExecution(request('00000000-0000-4000-8000-000000000002')),
    ).rejects.toThrow('refused');
    expect(calls.filter((call) => call.startsWith('session.'))).toEqual([]);
  });

  it('completes a retried start without a second attempt, Session or Turn', async () => {
    const { calls, execution } = fakes({ failFirstTurnStart: true });
    const id = '00000000-0000-4000-8000-000000000003';
    await expect(execution.startAgentStepExecution(request(id))).rejects.toThrow('lost');

    const retried = await execution.startAgentStepExecution(request(id));
    const again = await execution.startAgentStepExecution(request(id));

    expect(retried).toEqual(again);
    expect(calls.filter((call) => call.startsWith('engine.start'))).toHaveLength(1);
    // The Session create replays (same request id); the Turn starts once it was not admitted.
    expect(calls.filter((call) => call.startsWith('session.start'))).toHaveLength(2);
  });

  it('continues in the attempt Session and replays a retried Continue', async () => {
    const { calls, execution } = fakes();
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-000000000004'));
    const id = '00000000-0000-4000-8000-000000000005';

    const continued = await execution.startAgentStepExecution(request(id, { attempt: 1 }));
    const retried = await execution.startAgentStepExecution(request(id, { attempt: 1 }));

    expect(continued).toMatchObject({ kind: 'continued', session: 'reuse' });
    expect(retried).toEqual(continued);
    expect(calls.filter((call) => call === 'engine.start continue')).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('session.create'))).toHaveLength(1);
  });

  it('stops the running Turn of the attempt the owner was shown', async () => {
    const { calls, execution, attempt } = fakes();
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-000000000006'));
    const turnId = attempt()!.journal.turns.at(-1)!.turnId;

    await expect(
      execution.stopAgentStepExecution({
        subject,
        principal: 'owner',
        requestId: 'r',
        attemptId: 'other',
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
    await expect(
      execution.stopAgentStepExecution({
        subject,
        principal: 'owner',
        requestId: 'r',
        attemptId: ATTEMPT,
      }),
    ).resolves.toMatchObject({ attemptId: ATTEMPT, turnId });
    expect(calls.at(-1)).toBe(
      `session.cancel ${derivedId('00000000-0000-4000-8000-000000000006', 'session')} ${turnId}`,
    );
  });

  it('never reads the checkout for the projection; the explicit check does', async () => {
    const { calls, execution } = fakes();

    const projected = await execution.decorate(subject, ready);
    expect(projected.position).toMatchObject({
      next: { agent: { kind: 'available', baseline: 'unchecked' } },
    });
    expect(calls).toEqual([]);

    const checked = await execution.check(subject);
    expect(checked).toEqual({
      position: { step: 'breakdown' },
      agent: { kind: 'available', launch },
    });
    expect(calls).toEqual(['baseline']);
  });

  it('tells the owner a fresh Session is missing and creates it before Continue binds a Turn', async () => {
    const { calls, execution, attempt } = fakes({ failFirstCreate: true });
    await expect(
      execution.startAgentStepExecution(request('00000000-0000-4000-8000-000000000007')),
    ).rejects.toThrow('create failed');

    // The attempt started, its Session does not exist: a state of its own, Continue is the retry.
    const projected = await execution.decorate(subject, active);
    expect(projected.agentAttempt).toMatchObject({
      turn: { state: 'session-missing' },
      continue: { kind: 'available' },
    });

    calls.length = 0;
    const id = '00000000-0000-4000-8000-000000000008';
    const continued = await execution.startAgentStepExecution(request(id, { attempt: 1 }));

    expect(calls).toEqual([
      'baseline',
      `session.create ${derivedId(ATTEMPT, 'session-request')}`,
      'engine.start continue',
      `session.start ${derivedId('00000000-0000-4000-8000-000000000007', 'session')}`,
    ]);
    expect(continued).toMatchObject({ kind: 'continued', session: 'reuse' });
    expect(attempt()?.journal.turns).toHaveLength(2);
  });

  it("stops the agent's Turn when the owner's Return is recorded on the attempt", async () => {
    const { calls, execution, attempt } = fakes();
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-000000000009'));
    const turnId = attempt()!.journal.turns.at(-1)!.turnId;

    const returned = await execution.returnStep(
      {
        subject,
        step: 'solution',
        actor: { class: 'human', details: { actorId: 'o', trust: 'local' } },
      },
      'owner',
    );

    expect(returned.kind).toBe('return-requested');
    expect(calls.at(-1)).toBe(
      `session.cancel ${derivedId('00000000-0000-4000-8000-000000000009', 'session')} ${turnId}`,
    );
  });
});
