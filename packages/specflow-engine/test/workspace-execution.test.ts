import { randomUUID } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  bootstrapProjectHome,
  openSpecFlowEngine,
  createSpecificationForTesting,
  reserveCloseOperation,
  admitWorkspaceExecution,
  markWorkspaceExecutionDispatched,
  markWorkspaceExecutionUnknown,
  abandonWorkspaceExecutionAdmission,
  settleWorkspaceExecution,
  inspectWorkspaceExecution,
  listUnsettledWorkspaceExecutions,
  type WorkspaceExecutionIntent,
} from '../src/testing';
import { createGitTestProject, git, commitStaged } from './support/git-project';
import {
  spawnVitestWorker,
  awaitProcessMarker,
  readProcessCheckpoint,
  terminateCheckpointPid,
  reapVitestWorker,
} from './support/process-worker';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
});
async function fixture() {
  const root = await createGitTestProject(
    'specflow-execution-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'pin target');
  const engine = await bootstrapProjectHome(root);
  const intent: WorkspaceExecutionIntent = {
    operationId: randomUUID(),
    ownerId: randomUUID(),
    binding: 'a'.repeat(64),
  };
  const create = (title: string) => ({
    operationId: randomUUID(),
    title,
    created: '2026-10-26',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'existing' as const, workspaceId: engine.workspace.workspaceId },
  });
  return { root, engine, intent, create };
}
it('keeps claims across restart and lost acknowledgements, preserving exact identity and settlement', async () => {
  const { root, engine, intent } = await fixture();
  const admitted = await admitWorkspaceExecution(engine, intent);
  const reopened = await openSpecFlowEngine({ cwd: root });
  expect(await admitWorkspaceExecution(reopened, intent)).toEqual(admitted);
  await expect(
    admitWorkspaceExecution(reopened, { ...intent, binding: 'b'.repeat(64) }),
  ).rejects.toMatchObject({ code: 'EXECUTION_CONFLICT' });
  await markWorkspaceExecutionDispatched(reopened, intent);
  await expect(markWorkspaceExecutionDispatched(reopened, intent)).rejects.toMatchObject({
    code: 'EXECUTION_RECOVERY_REQUIRED',
  });
  await markWorkspaceExecutionUnknown(reopened, intent);
  const recovered = await openSpecFlowEngine({ cwd: root });
  expect((await inspectWorkspaceExecution(recovered, intent.operationId))?.phase).toBe('unknown');
  await expect(abandonWorkspaceExecutionAdmission(reopened, intent)).rejects.toMatchObject({
    code: 'EXECUTION_RECOVERY_REQUIRED',
  });
  const other = { ...intent, operationId: randomUUID() };
  await expect(admitWorkspaceExecution(reopened, other)).rejects.toMatchObject({
    code: 'RESOURCE_CONFLICT',
  });
  const receipt = {
    invocationId: intent.operationId,
    process: 'stopped' as const,
    outcome: 'completed' as const,
  };
  const settled = await settleWorkspaceExecution(reopened, intent, receipt);
  expect(await settleWorkspaceExecution(reopened, intent, receipt)).toEqual(settled);
  await expect(
    settleWorkspaceExecution(reopened, intent, { ...receipt, outcome: 'failed' }),
  ).rejects.toMatchObject({ code: 'EXECUTION_CONFLICT' });
  expect((await admitWorkspaceExecution(reopened, other)).phase).toBe('admitted');
  await abandonWorkspaceExecutionAdmission(reopened, other);
});
it('keeps project diagnostics available after workspace verification fails without permitting mutation', async () => {
  const { engine, intent } = await fixture();
  const admitted = await admitWorkspaceExecution(engine, intent);
  const unavailable = {
    ...engine,
    readRegistry: () => Promise.reject(new Error('Old workspace unavailable.')),
  };
  expect(await inspectWorkspaceExecution(unavailable, intent.operationId)).toEqual(admitted);
  expect((await listUnsettledWorkspaceExecutions(unavailable, { limit: 1 })).items).toEqual([
    admitted,
  ]);
  await expect(markWorkspaceExecutionDispatched(unavailable, intent)).rejects.toThrow(
    'Old workspace unavailable.',
  );
  await abandonWorkspaceExecutionAdmission(engine, intent);
});
it('admits only one concurrent external writer under the existing Project Home lock', async () => {
  const { engine, intent } = await fixture();
  const second = { ...intent, operationId: randomUUID() };
  const results = await Promise.allSettled([
    admitWorkspaceExecution(engine, intent),
    admitWorkspaceExecution(engine, second),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  for (const result of results)
    if (result.status === 'fulfilled')
      await abandonWorkspaceExecutionAdmission(engine, result.value.intent);
});
it('blocks new Create and Close reservations while a native CLI owns the project', async () => {
  const { engine, intent, create } = await fixture();
  const spec = await createSpecificationForTesting(engine, create('Before agent'));
  await admitWorkspaceExecution(engine, intent);
  await expect(
    createSpecificationForTesting(engine, create('Conflicting create')),
  ).rejects.toBeDefined();
  await expect(
    reserveCloseOperation(engine, {
      kind: 'specification-close',
      specId: spec.specId,
      operationId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  await abandonWorkspaceExecutionAdmission(engine, intent);
});
it('does not admit an external writer while an interrupted Create retains resources', async () => {
  const { engine, intent, create } = await fixture();
  await expect(
    createSpecificationForTesting(engine, create('Interrupted create'), {
      afterEffect: (effect) =>
        effect === 'reservation' ? Promise.reject(new Error('cut')) : Promise.resolve(),
    }),
  ).rejects.toThrow('cut');
  await expect(admitWorkspaceExecution(engine, intent)).rejects.toMatchObject({
    code: 'RESOURCE_CONFLICT',
  });
});
it('does not admit an external writer while a Close reservation retains resources', async () => {
  const { engine, intent, create } = await fixture();
  const spec = await createSpecificationForTesting(engine, create('Close before agent'));
  await reserveCloseOperation(engine, {
    kind: 'specification-close',
    operationId: randomUUID(),
    specId: spec.specId,
  });
  await expect(admitWorkspaceExecution(engine, intent)).rejects.toMatchObject({
    code: 'RESOURCE_CONFLICT',
  });
});
it.each(['admitted', 'dispatched', 'settled'])(
  'retains exact journal evidence after SIGKILL at %s',
  async (stage) => {
    const { root, intent } = await fixture();
    const marker = join(root, 'execution.checkpoint');
    const worker = spawnVitestWorker(
      'test/fixtures/workspace-execution-worker.test.ts',
      {
        NEVO_EXECUTION_WORKER: '1',
        NEVO_EXECUTION_ROOT: root,
        NEVO_EXECUTION_INTENT: JSON.stringify(intent),
        NEVO_EXECUTION_STAGE: stage,
        NEVO_EXECUTION_MARKER: marker,
      },
      120000,
    );
    try {
      await awaitProcessMarker(marker, worker);
      const checkpoint = await readProcessCheckpoint(marker, stage, intent.operationId);
      await terminateCheckpointPid(checkpoint.pid, worker);
      const reopened = await openSpecFlowEngine({ cwd: root });
      expect((await inspectWorkspaceExecution(reopened, intent.operationId))?.phase).toBe(stage);
      const other = { ...intent, operationId: randomUUID() };
      if (stage === 'settled') {
        expect((await admitWorkspaceExecution(reopened, other)).phase).toBe('admitted');
        await abandonWorkspaceExecutionAdmission(reopened, other);
      } else {
        await expect(admitWorkspaceExecution(reopened, other)).rejects.toMatchObject({
          code: 'RESOURCE_CONFLICT',
        });
        if (stage === 'dispatched')
          await expect(abandonWorkspaceExecutionAdmission(reopened, intent)).rejects.toMatchObject({
            code: 'EXECUTION_RECOVERY_REQUIRED',
          });
      }
    } finally {
      await reapVitestWorker(worker);
    }
  },
  120000,
);
it('fails closed on altered footprint or settlement identity rather than ignoring a journal', async () => {
  const { engine, intent } = await fixture();
  const record = await admitWorkspaceExecution(engine, intent);
  await writeFile(
    join(
      engine.context.project.stateRoot,
      'engine',
      'operations',
      'external-execution',
      intent.operationId + '.json',
    ),
    JSON.stringify({ ...record, resources: ['checkout:wrong'] }),
  );
  await expect(
    admitWorkspaceExecution(engine, { ...intent, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'EXECUTION_CORRUPT' });
});
