import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapProjectHome, withProjectControlLock } from '../src/testing';
import {
  fingerprintCreateClientIntent,
  normalizeCreateClientIntent,
} from '../src/specs/create/intent';
import {
  createJournalPath,
  publishCreateJournal,
  withCreateJournalLock,
  type CreateJournal,
  type CreateStage,
} from '../src/specs/create/journal';
import { listPublicCreateOperations } from '../src/specs/create/inspect/listing';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-listing-')));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  await mkdir(join(root, '.nevo'), { recursive: true });
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\n');
  execFileSync('git', ['add', '.gitignore', '.nevo/config.yaml'], { cwd: root });
  execFileSync(
    'git',
    ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'initial'],
    { cwd: root },
  );
  const engine = await bootstrapProjectHome(root);
  return { root, engine, context: engine.context };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function journal(
  fx: Fixture,
  overrides: Partial<Omit<CreateJournal, 'target'>> & { target?: CreateJournal['target'] } = {},
): CreateJournal {
  const requestIntent = normalizeCreateClientIntent({
    archetype: { id: 'minimal', version: 1 },
    title: 'Listing proof',
    target: { kind: 'existing', workspaceId: fx.engine.workspace.workspaceId },
  });
  return {
    version: 1,
    projectId: fx.context.project.projectId,
    operationId: randomUUID(),
    requestIntent,
    inputFingerprint: fingerprintCreateClientIntent(requestIntent),
    specId: randomUUID(),
    slug: 'listing-proof',
    title: 'Listing proof',
    created: '2026-10-14',
    stage: 'reserved',
    target: {
      kind: 'existing',
      workspaceId: fx.engine.workspace.workspaceId,
      workspaceRoot: fx.root,
    },
    files: [
      { relativePath: 'specs/active/listing-proof/specification.yaml', sha256: 'b'.repeat(64) },
      { relativePath: 'specs/active/listing-proof/overview.md', sha256: 'c'.repeat(64) },
    ],
    ...overrides,
  };
}

async function publish(fx: Fixture, record: CreateJournal) {
  await withCreateJournalLock(fx.context, async () => publishCreateJournal(fx.context, record));
}

describe('listPublicCreateOperations', () => {
  it('lists nothing when no journal exists', async () => {
    const fx = await fixture();
    expect(await listPublicCreateOperations(fx.engine)).toEqual([]);
  });

  it('projects stage, target, commit step and startedAt without leaking journal internals', async () => {
    const fx = await fixture();
    const started = '2026-10-14T10:00:00.000Z';
    const plain = journal(fx, { stage: 'manifest-written', startedAt: started });
    const committing = journal(fx, {
      stage: 'commit-writing',
      commit: { required: true, branch: 'develop', parentHead: 'a'.repeat(40) },
      reason: 'internal text that must never be exposed',
    });
    const done = journal(fx, { stage: 'completed' });
    const stuck = journal(fx, { stage: 'recovery-required', reason: 'secret reason' });
    for (const record of [plain, committing, done, stuck]) await publish(fx, record);

    const rows = new Map(
      (await listPublicCreateOperations(fx.engine)).map((row) => [row.operationId, row]),
    );
    expect(rows.get(plain.operationId)).toEqual({
      operationId: plain.operationId,
      kind: 'specification-create',
      state: 'in-progress',
      specId: plain.specId,
      slug: 'listing-proof',
      title: 'Listing proof',
      target: { kind: 'existing', workspaceId: fx.engine.workspace.workspaceId },
      commits: false,
      currentStep: 'writing-specification',
      startedAt: started,
      updatedAt: expect.any(String) as string,
    });
    expect(rows.get(committing.operationId)).toMatchObject({
      state: 'in-progress',
      commits: true,
      currentStep: 'committing-specification',
      target: { kind: 'existing', branch: 'develop' },
    });
    expect(rows.get(committing.operationId)?.startedAt).toBeUndefined();
    expect(rows.get(done.operationId)).toMatchObject({ state: 'completed' });
    expect(rows.get(done.operationId)?.currentStep).toBeUndefined();
    expect(rows.get(stuck.operationId)).toMatchObject({ state: 'recovery-required' });
    const serialized = JSON.stringify([...rows.values()]);
    for (const secret of ['secret reason', 'internal text', fx.root, 'requestIntent', 'files']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('exposes the branch of a new worktree target and uses mtime as updatedAt', async () => {
    const fx = await fixture();
    const requestIntent = normalizeCreateClientIntent({
      archetype: { id: 'minimal', version: 1 },
      title: 'Listing proof',
      target: { kind: 'new-worktree', branch: 'feature/x' },
    });
    const record = journal(fx, {
      stage: 'git-provisioned',
      requestIntent,
      inputFingerprint: fingerprintCreateClientIntent(requestIntent),
      gitPlan: {
        projectRoot: fx.context.project.homeRoot,
        gitInstanceId: fx.context.project.gitInstanceId,
      },
      target: {
        kind: 'new-worktree',
        workspaceId: randomUUID(),
        workspaceRoot: join(fx.root, 'wt'),
        branch: 'feature/x',
        baseCommit: 'd'.repeat(40),
        instanceId: randomUUID(),
      },
    });
    await publish(fx, record);
    const at = new Date('2026-10-20T08:00:00.000Z');
    await utimes(createJournalPath(fx.context, record.operationId), at, at);
    const [row] = await listPublicCreateOperations(fx.engine);
    expect(row).toMatchObject({
      currentStep: 'preparing-workspace',
      target: { kind: 'new-worktree', branch: 'feature/x' },
      updatedAt: at.toISOString(),
    });
    expect(JSON.stringify(row)).not.toContain('baseCommit');
  });

  it('turns a corrupt, oversized or foreign journal into a row and keeps listing the rest', async () => {
    const fx = await fixture();
    const good = journal(fx, { stage: 'registry-writing' });
    await publish(fx, good);
    const dir = join(fx.context.project.stateRoot, 'engine/operations/create');
    const corrupt = randomUUID();
    const huge = randomUUID();
    const linked = randomUUID();
    const foreign = journal(fx, { projectId: randomUUID() });
    await writeFile(join(dir, corrupt + '.json'), '{ not json');
    await writeFile(join(dir, huge + '.json'), 'x'.repeat(70000));
    await writeFile(join(dir, foreign.operationId + '.json'), JSON.stringify(foreign));
    await writeFile(join(dir, 'notes.json'), '{}');
    await writeFile(join(dir, 'readme.txt'), 'hi');
    const outside = join(fx.root, 'outside.json');
    await writeFile(outside, '{}');
    let symlinked = true;
    try {
      await symlink(outside, join(dir, linked + '.json'));
    } catch {
      symlinked = false;
    }

    const rows = await listPublicCreateOperations(fx.engine);
    const byId = new Map(rows.map((row) => [row.operationId, row]));
    expect(byId.get(good.operationId)).toMatchObject({ state: 'in-progress' });
    for (const id of [corrupt, huge, foreign.operationId, ...(symlinked ? [linked] : [])]) {
      expect(byId.get(id), id).toEqual({
        operationId: id,
        kind: 'specification-create',
        state: 'recovery-required',
        unreadable: true,
        updatedAt: expect.any(String) as string,
      });
    }
    expect(rows).toHaveLength(symlinked ? 5 : 4);
  });

  it('re-reads only files whose stat signature changed', async () => {
    const fx = await fixture();
    const record = journal(fx, { stage: 'reserved' });
    await publish(fx, record);
    const first = (await listPublicCreateOperations(fx.engine))[0]!;
    const again = (await listPublicCreateOperations(fx.engine))[0]!;
    expect(again).toBe(first);
    await publish(fx, { ...record, stage: 'registry-writing' });
    const changed = (await listPublicCreateOperations(fx.engine))[0]!;
    expect(changed).not.toBe(first);
    expect(changed.currentStep).toBe('registering');
  });

  it('does not spawn Git and does not wait for the control lock', async () => {
    const fx = await fixture();
    await publish(fx, journal(fx));
    const spawns: unknown[] = [];
    const listener = (message: unknown) => void spawns.push(message);
    // Holding the lock must not matter; only the listing itself is observed for Git processes.
    const rows = await withProjectControlLock(fx.context, async () => {
      subscribe('nevo.specflow.engine.git-process', listener);
      try {
        return await listPublicCreateOperations(fx.engine);
      } finally {
        unsubscribe('nevo.specflow.engine.git-process', listener);
      }
    });
    expect(rows).toHaveLength(1);
    expect(spawns).toEqual([]);
  });

  it('lists 1000 journals quickly once warm', async () => {
    const fx = await fixture();
    const dir = join(fx.context.project.stateRoot, 'engine/operations/create');
    await withCreateJournalLock(fx.context, () => Promise.resolve());
    const stages: CreateStage[] = ['reserved', 'completed'];
    for (let index = 0; index < 1000; index += 1) {
      const record = journal(fx, { stage: stages[index % 2]! });
      await writeFile(join(dir, record.operationId + '.json'), JSON.stringify(record));
    }
    expect(await listPublicCreateOperations(fx.engine)).toHaveLength(1000);
    const started = performance.now();
    expect(await listPublicCreateOperations(fx.engine)).toHaveLength(1000);
    // Generous bound only (shared CI hosts vary a lot); the memo avoids re-parsing 1000 files.
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 240000);
});
