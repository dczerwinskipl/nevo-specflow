import type {
  ActionProjection,
  AgentAttemptJournal,
  ProjectHold,
  WorkflowSubject,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import type { ActiveAgentAttempt, AgentStepEngine } from './engine-port';
import { SessionError } from '../../sessions';
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

/** The owner holds attempt 1 of the step; Hand to agent is offered. */
const ownerHolds: ActionProjection = {
  subject,
  position: {
    kind: 'active',
    step: { id: 'breakdown', title: 'Break it down' },
    attempt: {
      number: 1,
      startedAt: 't',
      actor: { class: 'human', details: { actorId: 'owner', trust: 'local' } },
    },
    exits: [],
  },
  actions: {
    handToAgent: { step: 'breakdown', attempt: 1, agent: { kind: 'available', launch } },
  },
} as unknown as ActionProjection;

/**
 * A fake Engine: `start` records the attempt the way the Engine's journal does (one Turn per
 * invocation), so a retry of the same request finds it.
 */
function fakes(
  options: {
    failFirstTurnStart?: boolean;
    refuseStart?: boolean;
    failFirstCreate?: boolean;
    hold?: ProjectHold;
    /** The provider's reason refusing every selection. */
    refuseSelection?: string;
    /** What the subject's projection is before an agent attempt exists (default: ready). */
    before?: ActionProjection;
    /** The checkout's baseline refusal. */
    baseline?: Awaited<ReturnType<AgentStepEngine['baseline']>>;
    /** The model ids the provider lists. */
    models?: readonly string[];
    /** The model an alias of `models` runs (Claude's `opus` runs `claude-opus-5-5`). */
    resolved?: Readonly<Record<string, string>>;
    /** Sessions that exist already, and the model and effort every Session runs. */
    existing?: readonly string[];
    sessionModel?: {
      readonly modelId: string;
      readonly effort?: string;
      readonly providerModeId?: string;
    };
    /** The models the provider runs in its auto mode (it lists auto and accept edits then). */
    autoFor?: string[];
    /** The Turn keeps running and its Session asks the owner this (a pending interaction). */
    waiting?: 'question' | 'permission';
  } = {},
) {
  const created = new Set<string>(options.existing);
  let failCreate = options.failFirstCreate === true;
  const calls: string[] = [];
  /** The message of every Turn the Sessions started, in order. */
  const messages: string[] = [];
  /** The provider mode of every Session created, in order. */
  const createdModes: (string | undefined)[] = [];
  const createdTitles: (string | undefined)[] = [];
  const origins: unknown[] = [];
  /** `contextChanged`: the Task context changed since the Turn was bound (the brief refuses). */
  const context = { changed: false };
  let attempt: ActiveAgentAttempt | undefined;
  const turns = new Set<string>();
  let failTurnStart = options.failFirstTurnStart === true;
  const engine: AgentStepEngine = {
    actions: () => Promise.resolve(attempt ? active : (options.before ?? ready)),
    activeAttempt: () => Promise.resolve(attempt),
    claimPhase: () => Promise.resolve(options.waiting ? 'dispatched' : 'settled'),
    busyWriter: () => Promise.resolve(undefined),
    projectHold: () => Promise.resolve(options.hold),
    archetypeAllowlist: () => Promise.resolve(undefined),
    workspaceIdOf: () => Promise.resolve(WORKSPACE),
    baseline: (_subject, _workspaceId, expected) => {
      calls.push(expected.handOver ? 'baseline hand-over' : 'baseline');

      return Promise.resolve(options.baseline);
    },
    start(input) {
      calls.push(
        `engine.start ${input.expected.handOver ? 'hand-over' : input.expected.attempt === undefined ? 'new' : 'continue'}`,
      );
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
          turns: [...journal.turns, options.waiting ? turn : { ...turn, finalizedAt: 't2' }],
        },
      };

      return Promise.resolve({
        attemptId: ATTEMPT,
        brief: { step: { id: 'breakdown', title: 'Break it down' }, attempt: 1, text: 'started' },
      });
    },
    brief: (_subject, _attemptId, invocationId) =>
      context.changed
        ? Promise.reject(new Error('WORKFLOW_STATE_CONFLICT'))
        : Promise.resolve({
            step: { id: 'breakdown', title: 'Break it down' },
            attempt: 1,
            text: `retried ${invocationId}`,
          }),
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
    provider: () =>
      options.models || options.autoFor
        ? ({
            title: 'Controlled',
            models: (options.models ?? []).map((modelId) => ({
              modelId,
              title: modelId,
              efforts: ['low', 'high'],
              ...(options.resolved?.[modelId]
                ? { resolvedModelId: options.resolved[modelId] }
                : {}),
            })),
            providerModes: [
              {
                modeId: 'acceptEdits',
                title: 'Accept edits',
                nativeMode: 'acceptEdits',
                mode: 'workspace-write',
                readiness: 'ready',
              },
              {
                modeId: 'auto',
                title: 'Auto',
                nativeMode: 'auto',
                mode: 'workspace-write',
                readiness: 'ready',
                modelIds: options.autoFor ?? [],
              },
            ],
          } as never)
        : undefined,
    validate(selection) {
      calls.push(`session.validate ${selection.providerId} ${selection.modelId ?? ''}`);

      return options.refuseSelection
        ? Promise.reject(new SessionError('MODEL_UNSUPPORTED', options.refuseSelection))
        : Promise.resolve();
    },
    create(_actor, input, _association, chosen) {
      calls.push(`session.create ${input.requestId}`);
      createdModes.push(input.providerModeId);
      createdTitles.push(input.title);
      if (failCreate) {
        failCreate = false;

        return Promise.reject(new Error('create failed'));
      }

      created.add(chosen!.sessionId!);

      return Promise.resolve({ sessionId: chosen!.sessionId! });
    },
    start(_actor, sessionId, input, turnOptions) {
      calls.push(`session.start ${sessionId}`);
      messages.push(input.message);
      origins.push(turnOptions?.origin);
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
    snapshot: () => {
      const turnId = attempt?.journal.turns.at(-1)?.turnId;

      return Promise.resolve({
        activeTurn: options.waiting && turnId ? { turnId, state: 'waitingForUser' } : undefined,
        ...(options.waiting && turnId
          ? { interaction: { kind: options.waiting, interactionId: 'interaction-1', turnId } }
          : {}),
        session: {
          providerId: 'controlled',
          mode: 'workspace-write',
          ...(options.sessionModel ?? { modelId: 'm' }),
        },
      } as never);
    },
    associateTasks: () => Promise.resolve(),
    hasSession: (sessionId) => Promise.resolve(created.has(sessionId)),
    hasTurn: (_sessionId, turnId) => Promise.resolve(turns.has(turnId)),
  };

  return {
    calls,
    messages,
    createdModes,
    createdTitles,
    origins,
    context,
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
      'session.validate controlled m',
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

  it('holds owner messages in the Session of the open attempt, and only there', async () => {
    const { execution } = fakes();
    const id = '00000000-0000-4000-8000-00000000000d';
    expect(await execution.ownerTurnHold(subject, derivedId(id, 'session'))).toBeUndefined();

    await execution.startAgentStepExecution(request(id));

    const hold = await execution.ownerTurnHold(subject, derivedId(id, 'session'));
    expect(hold).toContain('still open');
    expect(hold).toContain('Continue with a note');
    expect(await execution.ownerTurnHold(subject, 'another-session')).toBeUndefined();
  });

  it('refuses a selection the provider cannot run before the Engine starts an attempt', async () => {
    const reason =
      'The installed Claude has no auto mode for this model; choose another model or mode.';
    const { calls, execution, attempt } = fakes({ refuseSelection: reason });

    await expect(
      execution.startAgentStepExecution(request('00000000-0000-4000-8000-00000000000c')),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_AGENT_UNAVAILABLE',
      message: reason,
      option: { kind: 'unavailable', reason: 'provider-not-ready', detail: reason },
    });
    expect(calls).toEqual(['baseline', 'session.validate controlled m']);
    expect(attempt()).toBeUndefined();
  });

  it('checks a Continue with the Session it reuses before binding another Turn', async () => {
    const { calls, execution } = fakes();
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-00000000000d'));
    calls.length = 0;

    await execution.startAgentStepExecution(
      request('00000000-0000-4000-8000-00000000000e', { attempt: 1 }),
    );

    expect(calls.indexOf('session.validate controlled m')).toBeLessThan(
      calls.indexOf('engine.start continue'),
    );
  });

  it('leaves no Session when the Engine refuses the start', async () => {
    const { calls, execution } = fakes({ refuseStart: true });

    await expect(
      execution.startAgentStepExecution(request('00000000-0000-4000-8000-000000000002')),
    ).rejects.toThrow('refused');
    expect(calls.filter((call) => /^session.(create|start)/.test(call))).toEqual([]);
  });

  it('completes a retried start without a second attempt, Session or Turn', async () => {
    const { calls, messages, execution } = fakes({ failFirstTurnStart: true });
    const id = '00000000-0000-4000-8000-000000000003';
    await expect(execution.startAgentStepExecution(request(id))).rejects.toThrow('lost');

    const retried = await execution.startAgentStepExecution(request(id));
    const again = await execution.startAgentStepExecution(request(id));

    expect(retried).toEqual(again);
    expect(calls.filter((call) => call.startsWith('engine.start'))).toHaveLength(1);
    // The Session create replays (same request id); the Turn starts once it was not admitted.
    expect(calls.filter((call) => call.startsWith('session.start'))).toHaveLength(2);
    // The start briefs with the context it recorded; the retry asks the Engine for the bound Turn's.
    expect(messages).toEqual(['started', `retried ${derivedId(id, 'invocation')}`]);
  });

  it('refuses the same request id with another payload instead of finishing the earlier choice', async () => {
    const { calls, execution } = fakes({ failFirstTurnStart: true });
    const id = '00000000-0000-4000-8000-00000000000b';
    await expect(execution.startAgentStepExecution({ ...request(id), model: 'm' })).rejects.toThrow(
      'lost',
    );

    await expect(
      execution.startAgentStepExecution({ ...request(id), model: 'other' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CONFLICT' });
    expect(calls.filter((call) => call.startsWith('session.start'))).toHaveLength(1);

    // The identical payload is the retry: it completes the Turn the first request bound.
    await expect(
      execution.startAgentStepExecution({ ...request(id), model: 'm' }),
    ).resolves.toMatchObject({ kind: 'started', turnId: derivedId(id, 'turn') });
  });

  it('replays a dispatched Turn without briefing it again, after its agent changed files', async () => {
    const { execution, context } = fakes();
    const id = '00000000-0000-4000-8000-00000000000a';
    const started = await execution.startAgentStepExecution(request(id));

    context.changed = true;

    await expect(execution.startAgentStepExecution(request(id))).resolves.toEqual(started);
  });

  it('continues in the attempt Session and replays a retried Continue', async () => {
    const { calls, execution, origins } = fakes();
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-000000000004'));
    const id = '00000000-0000-4000-8000-000000000005';

    const continued = await execution.startAgentStepExecution(request(id, { attempt: 1 }));
    const retried = await execution.startAgentStepExecution(request(id, { attempt: 1 }));

    expect(continued).toMatchObject({ kind: 'continued', session: 'reuse' });
    expect(retried).toEqual(continued);
    expect(calls.filter((call) => call === 'engine.start continue')).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('session.create'))).toHaveLength(1);
    // The Continue's request says it continues the attempt; the start's does not.
    expect(origins.map((origin) => (origin as { continuation?: true }).continuation)).toEqual([
      undefined,
      true,
    ]);
  });

  it("sends a Continue's note in the attempt's own Turn, records it on the Turn and marks it for the transcript", async () => {
    const { execution, origins, messages, attempt } = fakes();
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-00000000000e'));
    const note = 'You timed out twice: run the tests one file at a time.';

    await execution.startAgentStepExecution({
      ...request('00000000-0000-4000-8000-00000000000f', { attempt: 1 }),
      message: note,
    });

    // The same attempt Turn, with the attempt's own brief and permissions: no separate chat Turn.
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain('## Note from the owner');
    expect(messages[1]).toContain(note);
    expect(attempt()!.journal.turns.at(-1)).toMatchObject({ ownerNote: note });
    expect(origins[1]).toMatchObject({ continuation: true, ownerNote: note });
    expect((origins[0] as { ownerNote?: string }).ownerNote).toBeUndefined();
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

  it("names the agent holding the project for another subject, never for the subject's own", async () => {
    const hold: ProjectHold = {
      kind: 'agent-outcome-unknown',
      subject: { specId: SPEC, taskId: 'api', title: 'API' },
      sessionId: 'session-b',
    };
    const { execution } = fakes({ hold });

    expect((await execution.decorate(subject, ready)).projectHold).toEqual(hold);
    expect(
      (await execution.decorate({ kind: 'task', specId: SPEC, taskId: 'api' }, ready)).projectHold,
    ).toBeUndefined();
    expect((await fakes().execution.decorate(subject, ready)).projectHold).toBeUndefined();
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
      'session.validate controlled m',
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

describe('Hand to agent', () => {
  const hand = (requestId: string) => ({
    subject,
    principal: 'owner',
    requestId,
    expected: { step: 'breakdown', attempt: 1, handOver: true as const },
  });

  it("checks the owner's attempt and starts the agent's next attempt in a fresh Session", async () => {
    const { calls, execution } = fakes({ before: ownerHolds });
    const id = '00000000-0000-4000-8000-0000000000e1';

    expect(await execution.check(subject)).toEqual({
      position: { step: 'breakdown', attempt: 1, handOver: true },
      agent: { kind: 'available', launch },
    });
    const result = await execution.startAgentStepExecution(hand(id));

    expect(calls).toEqual([
      'baseline hand-over',
      'baseline hand-over',
      'session.validate controlled m',
      'engine.start hand-over',
      `session.create ${derivedId(ATTEMPT, 'session-request')}`,
      `session.start ${derivedId(id, 'session')}`,
    ]);
    expect(result).toMatchObject({ kind: 'started', session: 'fresh' });
  });

  it("says the owner's uncommitted work blocks it before anything starts", async () => {
    const baseline = {
      reason: 'owner-work-uncommitted' as const,
      paths: ['src/a.ts'],
      count: 1,
    };
    const { calls, execution } = fakes({ before: ownerHolds, baseline });

    expect((await execution.check(subject)).agent).toMatchObject({
      kind: 'unavailable',
      reason: 'owner-work-uncommitted',
      paths: ['src/a.ts'],
    });
    await expect(
      execution.startAgentStepExecution(hand('00000000-0000-4000-8000-0000000000e2')),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_AGENT_UNAVAILABLE',
      option: { reason: 'owner-work-uncommitted' },
    });
    expect(calls).not.toContain('engine.start hand-over');
  });

  it('refuses a stale attempt', async () => {
    const { execution } = fakes({ before: ownerHolds });

    await expect(
      execution.startAgentStepExecution({
        ...hand('00000000-0000-4000-8000-0000000000e3'),
        expected: { step: 'breakdown', attempt: 2, handOver: true },
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });
  });

  it('reports a configured model the provider does not offer as no model, and needs the owner to choose', async () => {
    const { execution, calls } = fakes({ models: ['opus', 'sonnet'] });

    const projected = await execution.decorate(subject, ready);
    const agent = projected.position.kind === 'ready' ? projected.position.next.agent : undefined;
    expect(agent).toEqual({
      kind: 'available',
      launch: { ...launch, model: '' },
      modelRequired: true,
      baseline: 'unchecked',
    });
    expect((await execution.check(subject)).agent).toMatchObject({
      kind: 'available',
      modelRequired: true,
      launch: { model: '' },
    });

    await expect(
      execution.startAgentStepExecution(request('00000000-0000-4000-8000-0000000000f1')),
    ).rejects.toMatchObject({ code: 'WORKFLOW_INPUT_INVALID' });
    expect(calls).not.toContain('engine.start new');
    // The owner's choice from the provider's list starts it.
    await expect(
      execution.startAgentStepExecution({
        ...request('00000000-0000-4000-8000-0000000000f2'),
        model: 'opus',
      }),
    ).resolves.toMatchObject({ kind: 'started' });
  });

  it('proposes the alias that runs the configured model, with its effort, and starts with it', async () => {
    const withEffort = {
      subject,
      position: {
        kind: 'ready',
        next: {
          step: { id: 'breakdown', title: 'Break it down' },
          human: true,
          agent: { kind: 'available', launch: { ...launch, effort: 'high' } },
        },
      },
      actions: {},
    } as unknown as ActionProjection;
    const { execution, calls, attempt } = fakes({
      models: ['default', 'opus'],
      resolved: { default: 'm', opus: 'm' },
      before: withEffort,
    });

    const projected = await execution.decorate(subject, withEffort);
    expect(projected.position.kind === 'ready' && projected.position.next.agent).toMatchObject({
      kind: 'available',
      launch: { model: 'opus', effort: 'high' },
    });
    expect(projected.position.kind === 'ready' && projected.position.next.agent).not.toHaveProperty(
      'modelRequired',
    );
    await expect(
      execution.startAgentStepExecution(request('00000000-0000-4000-8000-0000000000f4')),
    ).resolves.toMatchObject({ kind: 'started' });
    expect(calls).toContain('session.validate controlled opus');
    expect(attempt()?.journal.actor.details).toMatchObject({
      providerTitle: 'Controlled',
      model: 'opus',
      modelTitle: 'opus',
    });
  });

  it('names the model, effort and work mode a continued Session runs, not the agent settings', async () => {
    const reuse = {
      subject,
      position: {
        kind: 'ready',
        next: {
          step: { id: 'breakdown', title: 'Break it down' },
          human: true,
          agent: {
            kind: 'available',
            launch: {
              ...launch,
              model: 'claude-opus-5-5',
              session: { mode: 'reuse', sessionId: 'earlier' },
            },
          },
        },
      },
      actions: {},
    } as unknown as ActionProjection;
    const { execution } = fakes({
      existing: ['earlier'],
      autoFor: ['opus'],
      sessionModel: { modelId: 'opus', effort: 'high', providerModeId: 'acceptEdits' },
    });

    const projected = await execution.decorate(subject, reuse);
    // The Session's own mode, even where a fresh Session would run in auto.
    expect(projected.position.kind === 'ready' && projected.position.next.agent).toMatchObject({
      kind: 'available',
      launch: { model: 'opus', effort: 'high', session: { mode: 'reuse', sessionId: 'earlier' } },
      workMode: { providerModeId: 'acceptEdits', title: 'Accept edits' },
    });
  });

  it('keeps an offered model as it is', async () => {
    const projected = await fakes({ models: ['m'] }).execution.decorate(subject, ready);
    expect(projected.position.kind === 'ready' && projected.position.next.agent).not.toHaveProperty(
      'modelRequired',
    );
  });

  it('says the agent waits for the owner while its Session asks a question or a permission', async () => {
    const { execution } = fakes({ waiting: 'permission' });
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-0000000000f3'));

    const projected = await execution.decorate(subject, active);
    expect(projected.agentAttempt?.turn).toMatchObject({
      state: 'working',
      waitingForOwner: { kind: 'permission', interactionId: 'interaction-1' },
    });
  });

  it('runs a fresh agent Session in auto when the provider runs its model in auto, and says so first', async () => {
    const auto = fakes({ autoFor: ['m'] });
    const projected = await auto.execution.decorate(subject, ready);
    expect(projected.position.kind === 'ready' && projected.position.next.agent).toMatchObject({
      workMode: { providerModeId: 'auto', title: 'Auto' },
    });
    await auto.execution.startAgentStepExecution(request('00000000-0000-4000-8000-0000000000f4'));
    expect(auto.createdModes).toEqual(['auto']);

    const manual = fakes({ autoFor: ['other'] });
    await manual.execution.startAgentStepExecution(request('00000000-0000-4000-8000-0000000000f5'));
    expect(manual.createdModes).toEqual(['acceptEdits']);
  });

  it("titles the fresh Session by its step and attempt and marks the Turn's request as SpecFlow's brief", async () => {
    const { execution, createdTitles, origins, messages } = fakes();
    await execution.startAgentStepExecution(request('00000000-0000-4000-8000-0000000000f6'));

    expect(createdTitles).toEqual(['Break it down · attempt 1']);
    expect(origins).toEqual([
      {
        kind: 'specflow-step-brief',
        specId: SPEC,
        step: { id: 'breakdown', title: 'Break it down' },
        attempt: 1,
      },
    ]);
    // What the agent receives is unchanged.
    expect(messages).toEqual(['started']);
  });
});
