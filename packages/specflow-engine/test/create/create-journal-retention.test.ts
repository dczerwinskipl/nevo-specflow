import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationScaffold,
  seedCatalogueForTesting,
} from '../../src/testing';
import {
  fingerprintCreateClientIntent,
  normalizeCreateClientIntent,
} from '../../src/specs/create/intent';
import {
  COMPLETED_OPERATION_JOURNAL_RETENTION_DAYS,
  createJournalPath,
  listCreateJournals,
  publishCreateJournal,
  readCreateJournal,
  removeExpiredCompletedCreateJournals,
  withCreateJournalLock,
  type CreateJournal,
  type CreateStage,
} from '../../src/specs/create/journal';

const catalogue = await seedCatalogueForTesting();

const roots: string[] = [];
const DAY = 24 * 60 * 60 * 1000;

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-gc-')));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\n');
  execFileSync('git', ['add', '.gitignore', '.nevo/config.yaml'], { cwd: root });
  execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'initial'],
    { cwd: root },
  );
  return (await bootstrapProjectHome(root)).context;
}

type Context = Awaited<ReturnType<typeof fixture>>;

function journal(context: Context, stage: CreateStage): CreateJournal {
  const title = 'Retention ' + randomUUID().slice(0, 8);
  const specId = randomUUID();
  const scaffold = createSpecificationScaffold({
    catalogue,
    archetypeId: 'minimal',
    specId,
    title,
    created: '2026-10-14',
  });
  const workspaceId = randomUUID();
  const requestIntent = normalizeCreateClientIntent({
    archetype: { id: 'minimal', version: 1 },
    title,
    target: { kind: 'existing', workspaceId },
  });
  return {
    version: 2,
    projectId: context.project.projectId,
    operationId: randomUUID(),
    requestIntent,
    inputFingerprint: fingerprintCreateClientIntent(requestIntent),
    specId,
    slug: scaffold.slug,
    title,
    created: '2026-10-14',
    catalogueRevision: 'r'.repeat(64),
    documentIds: scaffold.documentIds,
    stage,
    target: { kind: 'existing', workspaceId, workspaceRoot: context.project.homeRoot },
    files: scaffold.files.map(({ relativePath, sha256, bytes }) => ({
      relativePath,
      sha256,
      bytes,
    })),
  };
}

async function seed(context: Context, stage: CreateStage, ageDays: number, now: number) {
  const record = journal(context, stage);
  await withCreateJournalLock(context, () => publishCreateJournal(context, record));
  const when = new Date(now - ageDays * DAY);
  await utimes(createJournalPath(context, record.operationId), when, when);
  return record;
}

const sweep = (context: Context, now: number, extra = {}) =>
  withCreateJournalLock(context, () =>
    removeExpiredCompletedCreateJournals(context, { now, ...extra }),
  );

describe('Create journal retention', () => {
  it('defaults to seven days', () => {
    expect(COMPLETED_OPERATION_JOURNAL_RETENTION_DAYS).toBe(7);
  });

  it('removes only old completed journals', async () => {
    const context = await fixture();
    const now = Date.now();
    const oldDone = await seed(context, 'completed', 8, now);
    const recentDone = await seed(context, 'completed', 6, now);
    const oldRecovery = await seed(context, 'recovery-required', 30, now);
    const oldProgress = await seed(context, 'manifest-writing', 30, now);
    expect(await sweep(context, now)).toBe(1);
    expect(await readCreateJournal(context, oldDone.operationId)).toBeUndefined();
    for (const kept of [recentDone, oldRecovery, oldProgress]) {
      expect(await readCreateJournal(context, kept.operationId)).toEqual(kept);
    }
  });

  it('never removes the kept operation or a corrupt journal of the current format; unsupported ones age out', async () => {
    const context = await fixture();
    const now = Date.now();
    const keep = await seed(context, 'completed', 30, now);
    const old = new Date(now - 30 * DAY);
    // Not JSON and an other version are unsupported: deleted by age, never parsed further.
    const notJson = createJournalPath(context, randomUUID());
    await withCreateJournalLock(context, () => writeFile(notJson, '{not json'));
    await utimes(notJson, old, old);
    const oldVersion = await seed(context, 'completed', 30, now);
    await writeFile(
      createJournalPath(context, oldVersion.operationId),
      JSON.stringify({ ...oldVersion, version: 1 }),
    );
    await utimes(createJournalPath(context, oldVersion.operationId), old, old);
    // A broken journal of the CURRENT format is evidence and stays.
    const broken = await seed(context, 'completed', 30, now);
    await writeFile(
      createJournalPath(context, broken.operationId),
      JSON.stringify({ ...broken, stage: 'nonsense' }),
    );
    await utimes(createJournalPath(context, broken.operationId), old, old);
    expect(await sweep(context, now, { keepOperationId: keep.operationId })).toBe(2);
    const dir = await readdir(join(context.project.stateRoot, 'engine/operations/create'));
    expect(dir.sort()).toEqual([keep.operationId + '.json', broken.operationId + '.json'].sort());
  });

  it('respects the per-call limit and finishes on later calls', async () => {
    const context = await fixture();
    const now = Date.now();
    for (let i = 0; i < 5; i++) await seed(context, 'completed', 9, now);
    expect(await sweep(context, now, { limit: 2 })).toBe(2);
    expect(await sweep(context, now, { limit: 2 })).toBe(2);
    expect(await sweep(context, now, { limit: 2 })).toBe(1);
    expect(await sweep(context, now, { limit: 2 })).toBe(0);
  });

  it('ignores stray stage files in the strict listing and removes old ones in the sweep', async () => {
    const context = await fixture();
    const now = Date.now();
    const live = await seed(context, 'manifest-writing', 0, now);
    const directory = join(context.project.stateRoot, 'engine/operations/create');
    // What a SIGKILL between open() and rename() of writeJsonAtomically leaves behind.
    const stale = '.' + randomUUID() + '.json.' + randomUUID() + '.tmp';
    const young = '.' + randomUUID() + '.json.' + randomUUID() + '.tmp';
    await writeFile(join(directory, stale), '{"half');
    await writeFile(join(directory, young), '{"half');
    await writeFile(join(directory, '.DS_Store'), 'x');
    const old = new Date(now - 2 * 60 * 60 * 1000);
    await utimes(join(directory, stale), old, old);

    // Never throws: every future Create lists the journals under its reservation.
    const listed = await withCreateJournalLock(context, () => listCreateJournals(context));
    expect(listed.map((record) => record.operationId)).toEqual([live.operationId]);

    expect(await sweep(context, now)).toBe(0);
    const names = await readdir(directory);
    expect(names).not.toContain(stale);
    expect(names).toContain(young);
    expect(names).toContain('.DS_Store');
    expect(names).toContain(live.operationId + '.json');
  });

  it('still fails closed for an odd *.json entry', async () => {
    const context = await fixture();
    const directory = join(context.project.stateRoot, 'engine/operations/create');
    await withCreateJournalLock(context, async () => {
      await mkdir(join(directory, randomUUID() + '.json'));
      await expect(listCreateJournals(context)).rejects.toMatchObject({
        code: 'CREATE_JOURNAL_CORRUPT',
      });
    });
  });

  it('tolerates a missing journal directory', async () => {
    const context = await fixture();
    expect(await removeExpiredCompletedCreateJournals(context, { now: Date.now() })).toBe(0);
  });
});
