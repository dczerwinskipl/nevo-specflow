// Linux-only integration (real Git, real files): older-format Create journals and the
// payload store lifecycle (orphan sweep, crash between payload write and journal publication).
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertResourcesAvailable,
  bootstrapProjectHome,
  closeSpecification,
  createSpecificationForTesting,
  inspectCreateSpecification,
  readWorkspaceSpecification,
} from '../src/testing';
import {
  listPublicCreateOperations,
  readPublicCreateOperationRow,
  inspectPublicCreateOperation,
} from '../src/specs/create';
import {
  CREATE_JOURNAL_RELATIVE_DIR,
  createJournalPath,
  listCreateJournals,
  readCreateJournal,
  removeExpiredCompletedCreateJournals,
  withCreateJournalLock,
} from '../src/specs/create/journal';
import { createPayloadDirectory, writeCreatePayload } from '../src/specs/create/journal/payload';
import { resumeInterruptedCreateOperation } from '../src/specs/create';
import { createGitTestProject, git, commitStaged } from './support/git-project';

const DAY = 24 * 60 * 60 * 1000;
const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0).reverse())
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
});

async function fixture() {
  const root = await createGitTestProject(
    'specflow-unsupported-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  cleanup.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'pin integration target');
  const engine = await bootstrapProjectHome(root);
  const directory = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
  await withCreateJournalLock(engine.context, () => Promise.resolve());
  return { root, engine, directory, registry: await engine.readRegistry() };
}

async function plant(directory: string, text: string, ageDays = 0): Promise<string> {
  const operationId = randomUUID();
  const path = join(directory, operationId + '.json');
  await writeFile(path, text);
  const when = new Date(Date.now() - ageDays * DAY);
  await utimes(path, when, when);
  return operationId;
}

const OLD_FORMAT = JSON.stringify({ version: 1, stage: 'manifest-writing', files: [1, 2] });

describe('older-format Create journals', () => {
  it('never block Create or Close', async () => {
    const { root, engine, directory, registry } = await fixture();
    await plant(directory, OLD_FORMAT);
    await plant(directory, '{not json');
    await plant(directory, JSON.stringify({ stage: 'reserved' }));
    await plant(directory, JSON.stringify({ version: 3 }));

    const created = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Blocked by nothing',
      created: '2026-10-24',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
    });
    git(root, 'add', '--', 'specs');
    commitStaged(root, 'commit authored specification');

    const closed = await closeSpecification(engine, {
      operationId: randomUUID(),
      specId: created.specId,
    });
    expect(closed.status).toBe('completed');
    expect((await readWorkspaceSpecification(root, created.specId)).location).toBe('archive');
  }, 240000);

  it('are listed separately, never throw and never claim a resource', async () => {
    const { engine, directory, registry } = await fixture();
    await plant(directory, OLD_FORMAT);
    await plant(directory, '{not json');
    expect(await listCreateJournals(engine.context)).toEqual([]);
    await expect(
      assertResourcesAvailable(engine.context, [
        'checkout:' + registry.primaryWorkspaceId,
        'git-worktree-admin:' + engine.context.project.projectId,
      ]),
    ).resolves.toBeUndefined();
  });

  it('answer CREATE_JOURNAL_UNSUPPORTED by id and CREATE_JOURNAL_CORRUPT stays for a broken current journal', async () => {
    const { engine, directory } = await fixture();
    const old = await plant(directory, OLD_FORMAT);
    for (const read of [
      () => readCreateJournal(engine.context, old),
      () => inspectPublicCreateOperation(engine, old),
      () => inspectCreateSpecification(engine, old),
      () => resumeInterruptedCreateOperation(engine, old, { confirmOriginalStopped: true }),
    ]) {
      await expect(read()).rejects.toMatchObject({ code: 'CREATE_JOURNAL_UNSUPPORTED' });
    }
    // The file is left exactly as it was: nothing interprets or rewrites it.
    expect(await stat(createJournalPath(engine.context, old))).toMatchObject({
      size: OLD_FORMAT.length,
    });

    const broken = await plant(directory, JSON.stringify({ version: 2, stage: 'nonsense' }));
    await expect(readCreateJournal(engine.context, broken)).rejects.toMatchObject({
      code: 'CREATE_JOURNAL_CORRUPT',
    });
    // A corrupt current-format journal still blocks, as before.
    await expect(listCreateJournals(engine.context)).rejects.toMatchObject({
      code: 'CREATE_JOURNAL_CORRUPT',
    });
  });

  it('show as recovery-required with the unsupported code in the tolerant listing', async () => {
    const { engine, directory } = await fixture();
    const old = await plant(directory, OLD_FORMAT);
    const rows = await listPublicCreateOperations(engine);
    expect(rows).toEqual([
      expect.objectContaining({
        operationId: old,
        state: 'recovery-required',
        unreadable: true,
        code: 'CREATE_JOURNAL_UNSUPPORTED',
      }),
    ]);
    expect(await readPublicCreateOperationRow(engine, old)).toMatchObject({
      code: 'CREATE_JOURNAL_UNSUPPORTED',
    });
    // The content of the file is not exposed.
    expect(JSON.stringify(rows)).not.toContain('manifest-writing');
  });

  it('are deleted by the sweep after the retention and kept before it', async () => {
    const { engine, directory } = await fixture();
    const now = Date.now();
    const oldNotJson = await plant(directory, '{not json', 8);
    const oldVersion = await plant(directory, OLD_FORMAT, 30);
    const young = await plant(directory, OLD_FORMAT, 6);
    // An old, corrupt CURRENT-format journal is evidence and is never deleted by age.
    const corrupt = await plant(directory, JSON.stringify({ version: 2, stage: 'nonsense' }), 30);
    const removed = await withCreateJournalLock(engine.context, () =>
      removeExpiredCompletedCreateJournals(engine.context, { now }),
    );
    expect(removed).toBe(2);
    const names = await readdir(directory);
    expect(names).not.toContain(oldNotJson + '.json');
    expect(names).not.toContain(oldVersion + '.json');
    expect(names).toContain(young + '.json');
    expect(names).toContain(corrupt + '.json');
  });
});

describe('payload store lifecycle', () => {
  const content = (text: string) => ({
    sha256: createHashOf(text),
    content: text,
  });

  it('is ignored by the journal listings', async () => {
    const { engine, directory } = await fixture();
    const operationId = randomUUID();
    await withCreateJournalLock(engine.context, () =>
      writeCreatePayload(engine.context, operationId, [content('x')]),
    );
    expect(await readdir(directory)).toEqual([operationId + '.payload']);
    expect(await listCreateJournals(engine.context)).toEqual([]);
    expect(await listPublicCreateOperations(engine)).toEqual([]);
  });

  it('removes an orphan payload only after the retention and never while a journal exists', async () => {
    const { engine, directory } = await fixture();
    const now = Date.now();
    const orphanOld = randomUUID();
    const orphanYoung = randomUUID();
    const withUnsupportedJournal = randomUUID();
    const kept = randomUUID();
    await withCreateJournalLock(engine.context, async () => {
      for (const id of [orphanOld, orphanYoung, withUnsupportedJournal, kept]) {
        await writeCreatePayload(engine.context, id, [content('x' + id)]);
      }
    });
    await writeFile(join(directory, withUnsupportedJournal + '.json'), OLD_FORMAT);
    const old = new Date(now - 8 * DAY);
    for (const id of [orphanOld, withUnsupportedJournal, kept]) {
      await utimes(createPayloadDirectory(engine.context, id), old, old);
    }
    // The unsupported journal is young (the sweep keeps it), so its payload must stay too.
    await withCreateJournalLock(engine.context, () =>
      removeExpiredCompletedCreateJournals(engine.context, { now, keepOperationId: kept }),
    );
    const names = await readdir(directory);
    expect(names).not.toContain(orphanOld + '.payload');
    expect(names).toContain(orphanYoung + '.payload');
    expect(names).toContain(withUnsupportedJournal + '.payload');
    expect(names).toContain(kept + '.payload');
  });

  it('survives a crash between the payload write and the journal publication', async () => {
    const { engine, directory, registry } = await fixture();
    const operationId = randomUUID();
    // The state a crash right after the payload write leaves: files, no journal.
    await mkdir(createPayloadDirectory(engine.context, operationId));
    await writeFile(
      join(createPayloadDirectory(engine.context, operationId), 'a'.repeat(64)),
      'stale',
    );
    expect(await readCreateJournal(engine.context, operationId)).toBeUndefined();

    const created = await createSpecificationForTesting(engine, {
      operationId,
      title: 'After the crash',
      created: '2026-10-24',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
    });
    expect(created.documentIds.length).toBe(1);
    const payload = await readdir(createPayloadDirectory(engine.context, operationId));
    // Only the files of the new journal: the stale leftover was replaced.
    expect(payload).not.toContain('a'.repeat(64));
    expect(payload.length).toBe(2);
    expect(await readdir(directory)).toContain(operationId + '.json');
  }, 120000);

  it('removes the payload together with an expired completed journal', async () => {
    const { engine, directory, registry } = await fixture();
    const operationId = randomUUID();
    await createSpecificationForTesting(engine, {
      operationId,
      title: 'Expires',
      created: '2026-10-24',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
    });
    const path = createJournalPath(engine.context, operationId);
    const old = new Date(Date.now() - 8 * DAY);
    await utimes(path, old, old);
    await withCreateJournalLock(engine.context, () =>
      removeExpiredCompletedCreateJournals(engine.context, {}),
    );
    const names = await readdir(directory);
    expect(names).not.toContain(operationId + '.json');
    expect(names).not.toContain(operationId + '.payload');
  }, 120000);
});

function createHashOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
