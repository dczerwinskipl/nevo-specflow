import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { ResolvedProjectHome } from '../project/home/home';
import { listExecutionJournals, publishExecutionJournal, readExecutionJournal } from './journal';
import type { WorkspaceExecutionJournal } from './model';

let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
});
async function fixture() {
  root = await realpath(await mkdtemp(join(tmpdir(), 'execution-journal-')));
  const context: ResolvedProjectHome = {
    project: {
      projectId: randomUUID(),
      gitInstanceId: randomUUID(),
      homeRoot: root,
      stateRoot: root,
      gitCommonDir: join(root, '.git'),
      projectConfigPath: join(root, 'config'),
      localConfigPath: join(root, 'local'),
    },
    workspace: { root, gitCommonDir: join(root, '.git') },
  };
  const record: WorkspaceExecutionJournal = {
    version: 1,
    projectId: context.project.projectId,
    gitInstanceId: context.project.gitInstanceId,
    intent: { operationId: randomUUID(), ownerId: randomUUID(), binding: 'a'.repeat(64) },
    workspace: { workspaceId: randomUUID(), root },
    registryRevision: 1,
    resources: ['project-write:' + context.project.projectId],
    phase: 'admitted',
  };
  return { context, record, path: join(root, 'engine', 'operations', 'external-execution') };
}
it('archives settled records outside admission while preserving exact old invocation replay', async () => {
  const { context, record, path } = await fixture();
  const history: WorkspaceExecutionJournal[] = [];
  for (let index = 0; index < 25; index++) {
    const entry: WorkspaceExecutionJournal = {
      ...record,
      intent: { ...record.intent, operationId: randomUUID() },
      phase: 'settled',
      settlement: { kind: 'not-dispatched' },
    };
    await publishExecutionJournal(context, entry);
    history.push(entry);
  }
  expect(await readdir(path)).toEqual(['settled']);
  const pending = [];
  for await (const entry of listExecutionJournals(context, true)) pending.push(entry);
  expect(pending).toEqual([]);
  expect(await readExecutionJournal(context, history[0]!.intent.operationId)).toEqual(history[0]);
  await publishExecutionJournal(context, record);
  const active = [];
  for await (const entry of listExecutionJournals(context, true))
    active.push(entry.intent.operationId);
  expect(active).toEqual([record.intent.operationId]);
});
it('never treats a corrupt active claim as settled or an oversized record as absent', async () => {
  const { context, record, path } = await fixture();
  await publishExecutionJournal(context, record);
  const filename = join(path, record.intent.operationId + '.json');
  await writeFile(filename, 'x'.repeat(64 * 1024 + 1));
  await expect(readExecutionJournal(context, record.intent.operationId)).rejects.toMatchObject({
    code: 'EXECUTION_CORRUPT',
  });
  await writeFile(filename, JSON.stringify({ ...record, phase: 'settled' }));
  await expect(readExecutionJournal(context, record.intent.operationId)).rejects.toMatchObject({
    code: 'EXECUTION_CORRUPT',
  });
});
