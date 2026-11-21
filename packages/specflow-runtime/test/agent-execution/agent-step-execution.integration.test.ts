// Ask agent end to end over the real Session store, the real Engine (shipped definitions, Git on,
// automatic commits off) and the real broker endpoint, with the shared writable mock driver: the
// owner asks an agent to do the breakdown step; its Turn writes a document, drafts a Task and
// proposes its finish through the broker; the Turn ends and its settlement finalizes the attempt,
// so the run moves on with the agent's draft as the step's own. Real Git: run on Linux
// (tools/dev/linux-test.sh) for the full suite.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentBrokerResponse } from '@nevo/specflow-contracts/runtime';
import {
  finishStep,
  inspectActionsForRead,
  openWorkflow,
  readAgentAttempt,
  openAgentAttempts,
  startSpecificationExecution,
  type OwnerActor,
} from '@nevo/specflow-engine';
import {
  bootstrapProjectHome,
  inspectWorkspaceExecution,
  installDefinitionsForTesting,
  serializeSpecificationManifest,
} from '@nevo/specflow-engine/testing';
import { afterEach, expect, it, vi } from 'vitest';

import { createAgentExecutionFeature } from '../../src/features/agent-execution';
import {
  agentBrokerEnvironment,
  sendAgentBrokerRequest,
} from '../../src/features/agent-execution/broker/client';
import {
  createEngineSessionEffects,
  workspaceExecutionIdentity,
} from '../../src/features/sessions/effects/engine';
import {
  createSessionCoordinator,
  type SessionCoordinator,
} from '../../src/features/sessions/lifecycle/coordinator';
import { openSessionStore } from '../../src/features/sessions/persistence/store';
import { createWritableTestDriver } from '../../src/features/sessions/providers/mock-write.test-support';
import { createSpecificationWorkspaceResolver } from '../../src/features/sessions/workspace/specification-workspace';

let root = '';
let coordinator: SessionCoordinator | undefined;
let closeBroker: (() => Promise<void>) | undefined;
afterEach(async () => {
  await coordinator?.close();
  coordinator = undefined;
  await closeBroker?.();
  closeBroker = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

const owner: OwnerActor = { class: 'human', details: { actorId: 'owner', trust: 'local' } };

async function project() {
  root = await realpath(await mkdtemp(join(tmpdir(), 'agent-step-')));
  const checkout = join(root, 'checkout');
  await mkdir(checkout);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: checkout, windowsHide: true, stdio: 'pipe' });
  git('init', '-q');
  git('config', '--local', 'core.autocrlf', 'false');
  git('config', '--local', 'user.name', 'T');
  git('config', '--local', 'user.email', 't@example.invalid');
  await mkdir(join(checkout, '.nevo'));
  await writeFile(join(checkout, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(checkout, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  const specId = randomUUID();
  const dir = join(checkout, 'specs', 'active', 'hand');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'specification.yaml'),
    serializeSpecificationManifest({
      specId,
      slug: 'hand',
      title: 'Hand',
      archetype: {
        id: 'minimal',
        version: 1,
        requirements: [{ documentType: 'overview', minCount: 1 }],
      },
      documents: [{ id: 'overview', path: 'overview.md', type: 'overview' }],
      folders: [],
      status: 'draft',
      location: 'active',
      priority: 10,
      created: '2026-11-21',
    }),
  );
  await writeFile(join(dir, 'overview.md'), '# Hand\n');
  git('add', '.');
  git('commit', '-qm', 'initial');
  const engine = await bootstrapProjectHome(checkout);
  await installDefinitionsForTesting(engine);
  // The owner does the first three steps by hand; their execution state is committed, so the
  // checkout is clean for the agent.
  const workflow = await openWorkflow(engine);
  for (const step of ['requirements', 'specification', 'solution']) {
    const started = await startSpecificationExecution(workflow, {
      specId,
      archetype: 'minimal',
      actor: owner,
    });
    if (started.kind === 'terminal') {
      throw new Error('Unexpected end.');
    }

    await finishStep(workflow, {
      subject: { kind: 'specification', specId },
      step,
      attempt: started.context.attempt,
      input: {},
      actor: owner,
    });
  }

  // (Each finish commits its own execution state; anything left over is committed here.)
  if (git('status', '--porcelain').toString().trim()) {
    git('add', '-A');
    git('commit', '-qm', 'owner steps');
  }

  return { checkout, specId, engine };
}

/** The Session coordinator over a real store and agent execution, as the Runtime wires them. */
async function runtime(
  engine: Awaited<ReturnType<typeof project>>['engine'],
  checkout: string,
  driver: ReturnType<typeof createWritableTestDriver>,
) {
  const store = await openSessionStore({
    directory: join(root, 'store'),
    projectId: engine.context.project.projectId,
  });
  const agentExecution = createAgentExecutionFeature({
    engine,
    coordinator: () => coordinator,
  });
  closeBroker = () => agentExecution.close();
  coordinator = createSessionCoordinator(
    store,
    driver,
    engine.context.project.projectId,
    true,
    {
      kind: 'read-only',
      workspace: checkout,
      temporaryRoot: join(root, 'temporary'),
      workspaceIdentity: workspaceExecutionIdentity(engine),
    },
    createEngineSessionEffects(engine, {
      settleAgentAttempt: agentExecution.settleAgentAttempt,
    }),
    createSpecificationWorkspaceResolver(engine),
    undefined,
    agentExecution.capabilities,
  );

  return agentExecution;
}

it('runs an agent attempt: a document, a Task draft and a finish proposal, finalized when the Turn ends', async () => {
  const { checkout, specId, engine } = await project();
  const seen: Record<string, AgentBrokerResponse> = {};
  const driver = createWritableTestDriver(async (invocation) => {
    const broker = agentBrokerEnvironment(invocation.runtimeEnvironment?.values ?? {})!;
    const send = (
      requestId: string,
      operation: Parameters<typeof sendAgentBrokerRequest>[0]['operation'],
    ) => sendAgentBrokerRequest({ ...broker, requestId, operation });
    seen.scope = await send('scope-describe-1', { name: 'scope.describe' });
    seen.document = await send('create-plan-1', {
      name: 'documents.create',
      specId,
      documents: [{ path: 'plan.md', type: 'note', content: '# Plan\n' }],
    });
    seen.draft = await send('draft-task-1', {
      name: 'tasks.create',
      specId,
      taskId: 'api',
      title: 'API',
      type: 'implementation',
    });
    seen.otherStep = await send('finish-other', {
      name: 'workflow.finish',
      specId,
      step: 'solution',
      stepAttempt: 1,
    });
    seen.finish = await send('finish-breakdown', {
      name: 'workflow.finish',
      specId,
      step: 'breakdown',
      stepAttempt: 1,
      feedback: 'One Task for the API.',
      tasks: [{ id: 'api', title: 'API', type: 'implementation' }],
    });
  });

  const agentExecution = await runtime(engine, checkout, driver);
  const subject = { kind: 'specification', specId } as const;

  // The projection explains the defaults: the planner's provider is not enabled here.
  const projection = await agentExecution.agentAvailability(
    subject,
    await inspectActionsForRead(await openWorkflow(engine), subject),
  );
  expect(projection.position).toMatchObject({
    kind: 'ready',
    next: {
      step: { id: 'breakdown' },
      agent: {
        kind: 'unavailable',
        reason: 'provider-not-ready',
        launch: { archetype: 'task-planner', provider: 'claude', session: { mode: 'fresh' } },
      },
    },
  });

  // The owner chooses the enabled provider for the fresh Session.
  const started = await agentExecution.agentStepExecution.startAgentStepExecution({
    subject,
    principal: 'owner',
    requestId: randomUUID(),
    expected: { step: 'breakdown' },
    provider: 'controlled',
    model: 'mock-model',
  });
  expect(started).toMatchObject({
    kind: 'started',
    step: 'breakdown',
    attempt: 1,
    session: 'fresh',
  });

  await vi.waitFor(
    async () => {
      expect((await coordinator!.snapshot(started.sessionId, 'owner')).activeTurn).toBeUndefined();
    },
    { timeout: 60_000 },
  );
  await vi.waitFor(
    async () => {
      const attempt = await readAgentAttempt(await openAgentAttempts(engine), started.attemptId);
      expect(attempt?.proposal?.state).toBe('finalized');
    },
    { timeout: 60_000 },
  );

  expect(seen.scope).toMatchObject({
    ok: true,
    value: {
      scope: {
        kind: 'attempt',
        attempt: { step: 'breakdown', attempt: 1 },
        operations: expect.arrayContaining(['tasks.create', 'workflow.finish']) as unknown,
      },
    },
  });
  expect(seen.document).toMatchObject({ ok: true });
  expect(seen.draft).toMatchObject({ ok: true, value: { result: { taskId: 'api' } } });
  expect(seen.otherStep).toMatchObject({
    ok: false,
    error: { code: 'AGENT_SCOPE_REFUSED', details: { reason: 'other-attempt' } },
  });
  expect(seen.finish).toMatchObject({
    ok: true,
    value: { result: { kind: 'recorded', transition: 'proposed' } },
  });
  expect(await readFile(join(checkout, 'specs/active/hand/plan.md'), 'utf8')).toBe('# Plan\n');

  // Finalized: the step is the agent's, the run is at the review, the draft is the step's own.
  const after = await inspectActionsForRead(await openWorkflow(engine), subject);
  expect(after.position).toMatchObject({
    kind: 'ready',
    next: { step: { id: 'breakdown-review' } },
  });
  const draft = await inspectActionsForRead(await openWorkflow(engine), {
    kind: 'task',
    specId,
    taskId: 'api',
  });
  expect(draft.position).toMatchObject({ kind: 'blocked' });
  const journal = await readAgentAttempt(await openAgentAttempts(engine), started.attemptId);
  expect(journal?.turns).toHaveLength(1);
  expect(journal?.turns[0]?.finalizedAt).toBeDefined();
  // The claim settled with the native result, and its intent names the attempt.
  expect(await inspectWorkspaceExecution(engine, journal!.turns[0]!.invocationId)).toMatchObject({
    phase: 'settled',
    intent: { attempt: { attemptId: started.attemptId } },
    settlement: { kind: 'native-result' },
  });
}, 180_000);

it('returns during an agent attempt: the Turn is cancelled, a late proposal refused, the return applied once it stopped', async () => {
  const { checkout, specId, engine } = await project();
  const seen: Record<string, AgentBrokerResponse> = {};
  let working: () => void = () => undefined;
  const turnWorking = new Promise<void>((resolve) => {
    working = resolve;
  });
  const driver = createWritableTestDriver(async (invocation, _emit, signal) => {
    const broker = agentBrokerEnvironment(invocation.runtimeEnvironment?.values ?? {})!;
    const send = (
      requestId: string,
      operation: Parameters<typeof sendAgentBrokerRequest>[0]['operation'],
    ) => sendAgentBrokerRequest({ ...broker, requestId, operation });
    seen.document = await send('create-plan-1', {
      name: 'documents.create',
      specId,
      documents: [{ path: 'plan.md', type: 'note', content: '# Plan\n' }],
    });
    working();
    // The agent keeps working until the owner's Return stops it, then tries to finish anyway.
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    seen.late = await send('finish-late', {
      name: 'workflow.finish',
      specId,
      step: 'breakdown',
      stepAttempt: 1,
    });
  });
  const agentExecution = await runtime(engine, checkout, driver);
  const subject = { kind: 'specification', specId } as const;
  const started = await agentExecution.agentStepExecution.startAgentStepExecution({
    subject,
    principal: 'owner',
    requestId: randomUUID(),
    expected: { step: 'breakdown' },
    provider: 'controlled',
    model: 'mock-model',
  });
  await turnWorking;

  const returned = await agentExecution.agentStepExecution.returnStep(
    { subject, step: 'solution', feedback: 'Rethink the split.', actor: owner },
    'owner',
  );
  expect(returned).toMatchObject({
    kind: 'return-requested',
    to: 'solution',
    attemptId: started.attemptId,
    turnId: started.turnId,
  });

  await vi.waitFor(
    async () => {
      const attempt = await readAgentAttempt(await openAgentAttempts(engine), started.attemptId);
      expect(attempt?.returnRequest?.state).toBe('applied');
    },
    { timeout: 60_000 },
  );
  expect(seen.document).toMatchObject({ ok: true });
  expect(seen.late).toMatchObject({ ok: false, error: { code: 'WORKFLOW_ATTEMPT_MISMATCH' } });
  // Applied by the Turn's finalize: the run is back at the solution; the agent's document stays.
  const after = await inspectActionsForRead(await openWorkflow(engine), subject);
  expect(after.position).toMatchObject({ kind: 'ready', next: { step: { id: 'solution' } } });
  expect(await readFile(join(checkout, 'specs/active/hand/plan.md'), 'utf8')).toBe('# Plan\n');
}, 180_000);
