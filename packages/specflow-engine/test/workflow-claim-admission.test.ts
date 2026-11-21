// The production wiring of the writer-claim admission (F05, D11) with Git off, where no commit
// admission consults the claims: kernel writes, archetype edits, the definitions install and
// document writes refuse while an
// agent Turn holds the project, naming its Session; that Turn's own writes pass while it is
// `dispatched`. The per-writer table is `src/workflow/state/claim-guard.test.ts`.
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { sha256Hex } from '../src/hash';
import {
  admitWorkspaceExecution,
  applyDocumentChange,
  bootstrapProjectHome,
  createSpecificationForTesting,
  createTask,
  finalizeAgentAttempt,
  inspectExecution,
  inspectWorkspaceExecution,
  installProjectDefinitions,
  markWorkspaceExecutionDispatched,
  markWorkspaceExecutionUnknown,
  openAgentAttempts,
  openArchetypeEditing,
  openWorkflow,
  proposeAgentFinish,
  readAgentAttempt,
  rememberArchetypeModel,
  settleWorkspaceExecution,
  settleWorkspaceExecutionInSection,
  startAgentAttempt,
  type AgentActor,
  type FinalizeBoundary,
  type WorkspaceExecutionIntent,
} from '../src/testing';
import { createGitTestProject } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  }
});

const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;

it('admits only the owning Turn while an agent claim is unsettled, with Git off', async () => {
  // No `git:` block: Git is off, so nothing but the kernel admission sees the claim.
  const root = await createGitTestProject('specflow-claim-admission-', 'runtime: {}\n');
  roots.push(root);
  const engine = await bootstrapProjectHome(root);
  await installProjectDefinitions(engine);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Agent claim',
    created: '2026-11-20',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  const intent: WorkspaceExecutionIntent = {
    operationId: randomUUID(),
    ownerId: randomUUID(),
    binding: 'a'.repeat(64),
  };
  const task = (taskId: string) => ({
    specId: spec.specId,
    taskId,
    title: 'Task ' + taskId,
    type: 'implementation',
    actor: owner,
  });
  const overview = join(root, 'specs/active', spec.slug, 'overview.md');
  const save = async (content: string) => ({
    action: 'save' as const,
    documentId: 'overview',
    content,
    expectedRevision: sha256Hex(await readFile(overview, 'utf8')),
  });
  const owned = { ownedExecution: { operationId: intent.operationId } };
  const foreign = await openWorkflow(engine);
  const own = await openWorkflow(engine, owned);
  const busy = (cause: string) => ({
    code: 'WORKFLOW_SPECIFICATION_BUSY',
    busy: { cause, sessionId: intent.ownerId },
  });

  // Admitted, not dispatched: nothing of the Turn runs yet, so not even its own writes pass.
  await admitWorkspaceExecution(engine, intent);
  await expect(createTask(own, task('early'))).rejects.toMatchObject(busy('agent-turn'));

  await markWorkspaceExecutionDispatched(engine, intent);
  const refused = createTask(foreign, task('docs'));
  await expect(refused).rejects.toMatchObject(busy('agent-turn'));
  await expect(refused).rejects.toThrow(`agent Session Turn (Session ${intent.ownerId})`);
  await expect(
    rememberArchetypeModel(openArchetypeEditing(engine), 'implementer', {
      provider: 'codex',
      model: 'gpt-x',
    }),
  ).rejects.toMatchObject(busy('agent-turn'));
  await expect(
    installProjectDefinitions(engine, { targets: ['agent-archetype/reviewer'], force: true }),
  ).rejects.toMatchObject(busy('agent-turn'));
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), await save('# Foreign\n')),
  ).rejects.toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'agent-turn' } });

  // The owning Turn's writes pass (the broker's in-process identity), each its own mutation.
  await expect(createTask(own, task('docs'))).resolves.toMatchObject({
    task: { taskId: 'docs' },
  });
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), await save('# Own\n'), owned),
  ).resolves.toMatchObject({ documents: [{ id: 'overview' }] });

  // The Turn ended without a verified outcome: its own writes are refused too, with the remedy.
  await markWorkspaceExecutionUnknown(engine, intent);
  await expect(createTask(own, task('late'))).rejects.toMatchObject(busy('agent-turn-unknown'));
  await expect(createTask(own, task('late'))).rejects.toThrow('use Check outcome');

  await settleWorkspaceExecution(engine, intent, {
    invocationId: intent.operationId,
    process: 'stopped',
    outcome: 'completed',
  });
  await expect(createTask(foreign, task('after'))).resolves.toMatchObject({
    task: { taskId: 'after' },
  });
  // A write still naming the settled Turn, or a claim that never existed, is refused: never admitted
  // as an unclaimed write.
  const notHeld = { code: 'SPEC_BUSY', details: { cause: 'claim-not-held' } };
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), await save('# Late\n'), owned),
  ).rejects.toMatchObject(notHeld);
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), await save('# None\n'), {
      ownedExecution: { operationId: randomUUID() },
    }),
  ).rejects.toMatchObject(notHeld);
  await expect(createTask(own, task('settled'))).rejects.toMatchObject({
    code: 'WORKFLOW_SPECIFICATION_BUSY',
    busy: { cause: 'other' },
  });
  await expect(
    installProjectDefinitions(engine, { targets: ['agent-archetype/reviewer'], force: true }),
  ).resolves.toMatchObject({
    outcome: { status: 'planned' },
  });
}, 240_000);

it('finalizes an agent attempt whose Turn claim is unknown in one section, then admits others', async () => {
  const root = await createGitTestProject('specflow-agent-finalize-', 'runtime: {}\n');
  roots.push(root);
  const engine = await bootstrapProjectHome(root);
  await installProjectDefinitions(engine);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Agent finalize',
    created: '2026-11-20',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  const writer: AgentActor = {
    class: 'agent',
    details: { archetype: 'spec-writer', provider: 'claude', sessionId: 'session-a' },
  };
  const subject = { kind: 'specification', specId: spec.specId } as const;
  const intent: WorkspaceExecutionIntent = {
    operationId: randomUUID(),
    ownerId: 'session-a',
    binding: 'a'.repeat(64),
  };
  const receipt = {
    invocationId: intent.operationId,
    process: 'stopped' as const,
    outcome: 'completed' as const,
  };
  const agent = await openAgentAttempts(engine);
  const { binding } = await startAgentAttempt(agent, {
    subject,
    archetype: 'feature',
    actor: writer,
    expected: { step: 'requirements' },
    workspaceId: engine.workspace.workspaceId,
    turn: { invocationId: intent.operationId, turnId: 'turn-1' },
  });
  await admitWorkspaceExecution(engine, intent);
  await markWorkspaceExecutionDispatched(engine, intent);
  const turn = {
    attemptId: binding.attemptId,
    invocationId: intent.operationId,
    actor: writer,
    subject,
    step: 'requirements',
    attempt: 1,
  };
  await proposeAgentFinish(agent, { turn, input: {} });
  // The Turn ended without a verified outcome: only the finalize form admits the attempt's write.
  await markWorkspaceExecutionUnknown(engine, intent);
  const foreign = await openWorkflow(engine);
  const later = { specId: spec.specId, taskId: 'later', title: 'Later', type: 'implementation' };
  await expect(createTask(foreign, { ...later, actor: owner })).rejects.toMatchObject({
    code: 'WORKFLOW_SPECIFICATION_BUSY',
  });
  // The lock-held settlement never takes the lock, so it refuses outside a section.
  await expect(settleWorkspaceExecutionInSection(engine, intent, receipt)).rejects.toThrow(
    'inside a project control-lock section',
  );

  // Crashes inside the section, with the real store and settlement: each run converges.
  const finalize = { attemptId: binding.attemptId, intent, receipt };
  const crashingAt = (boundary: FinalizeBoundary) => ({
    ...agent,
    finalize: {
      ...agent.finalize,
      faults: (at: FinalizeBoundary) => {
        if (at === boundary) {
          throw new Error(`Crash at ${at}.`);
        }
      },
    },
  });
  const position = async () =>
    (await inspectExecution(foreign, spec.specId)).specification?.record.run.position;
  await expect(finalizeAgentAttempt(crashingAt('step-published'), finalize)).rejects.toThrow(
    'Crash at step-published.',
  );
  expect(await position()).not.toMatchObject({ step: 'requirements' });
  expect((await readAgentAttempt(agent, binding.attemptId))?.proposal?.state).toBe('pending');
  expect((await inspectWorkspaceExecution(engine, intent.operationId))?.phase).toBe('unknown');
  await expect(finalizeAgentAttempt(crashingAt('attempt-recorded'), finalize)).rejects.toThrow(
    'Crash at attempt-recorded.',
  );
  expect((await readAgentAttempt(agent, binding.attemptId))?.proposal?.state).toBe('finalized');
  expect((await inspectWorkspaceExecution(engine, intent.operationId))?.phase).toBe('unknown');
  const reached = await position();

  expect(
    await finalizeAgentAttempt(agent, { attemptId: binding.attemptId, intent, receipt }),
  ).toMatchObject({
    kind: 'finished',
    transition: 'agreed',
    postActions: [{ action: 'commit-execution-state', status: 'skipped' }],
  });
  const attempt = await readAgentAttempt(agent, binding.attemptId);
  expect(attempt).toMatchObject({
    proposal: { state: 'finalized' },
    postActions: [{ state: 'done' }],
  });
  expect(await position()).toEqual(reached);
  expect((await inspectWorkspaceExecution(engine, intent.operationId))?.phase).toBe('settled');
  // Git is off: there is no dirty set to record.
  expect(attempt?.dirtySet).toBeUndefined();
  await expect(createTask(foreign, { ...later, actor: owner })).resolves.toMatchObject({
    task: { taskId: 'later' },
  });
  expect(
    await finalizeAgentAttempt(agent, { attemptId: binding.attemptId, intent, receipt }),
  ).toEqual({ kind: 'finished', transition: 'agreed', postActions: [] });
}, 240_000);
