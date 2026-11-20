// The production wiring of the writer-claim admission (F05, D11) with Git off, where no commit
// admission consults the claims: kernel writes, archetype edits and document writes refuse while an
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
  installProjectDefinitions,
  markWorkspaceExecutionDispatched,
  markWorkspaceExecutionUnknown,
  openArchetypeEditing,
  openWorkflow,
  rememberArchetypeModel,
  settleWorkspaceExecution,
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
}, 240_000);
