import { beforeAll, describe, expect, it } from 'vitest';

import {
  DefinitionInstallError,
  installDefinitions,
  planInstall,
  type InstallOptions,
  type InstallPlan,
  type InstallPlanOutcome,
} from './install';
import { createDefaultDefinitionRegistry } from './kinds';
import { loadDefinitions } from './loader';
import { resolveProjectCatalogue } from './project-catalogue';
import { openSeedSource } from './seed';
import type { DefinitionSource } from './source';
import { documentTypeFile, MemoryDefinitionSource } from './test-support';
import type { DefinitionWriter } from './writer';

const registry = createDefaultDefinitionRegistry();
let seed: DefinitionSource;

beforeAll(async () => {
  seed = (await openSeedSource()).source;
});

async function run(
  target: MemoryDefinitionSource,
  options: InstallOptions = {},
  writer: DefinitionWriter = target,
) {
  return installDefinitions({ seed, target, writer, registry, options });
}

function planOf(outcome: InstallPlanOutcome): InstallPlan {
  if (outcome.status !== 'planned') throw new Error('Expected a plan.');
  return outcome.plan;
}

function actions(plan: InstallPlan, action: string): string[] {
  return plan.items.filter((item) => item.action === action).map((item) => item.path);
}

async function problemsOf(target: MemoryDefinitionSource) {
  return (await loadDefinitions(target, registry)).problems;
}

const ALL_SEED_FILES = 9 + 3 + 1;

describe('bare install (bootstrap)', () => {
  it('installs every shipped definition and template file into an empty project', async () => {
    const target = new MemoryDefinitionSource();
    const { outcome, written } = await run(target);
    const plan = planOf(outcome);
    expect(plan.mode).toBe('bootstrap');
    expect(written).toHaveLength(ALL_SEED_FILES);
    expect(target.paths()).toContain('specification-archetype/templates/overview.md');
    expect(await problemsOf(target)).toEqual([]);
    const catalogue = resolveProjectCatalogue(await loadDefinitions(target, registry)).catalogue;
    expect(catalogue.archetypes).toHaveLength(3);
  });

  it('is idempotent: a second bare run refuses and a second explicit run changes nothing', async () => {
    const target = new MemoryDefinitionSource();
    await run(target);
    const before = target.paths().map((path) => [path, target.text(path)]);

    const second = await run(target);
    expect(second.outcome.status).toBe('refused');
    expect(second.written).toEqual([]);

    const again = await run(target, { addMissing: true });
    expect(again.written).toEqual([]);
    expect(actions(planOf(again.outcome), 'unchanged')).toHaveLength(ALL_SEED_FILES);
    expect(target.paths().map((path) => [path, target.text(path)])).toEqual(before);
  });

  it('refuses on a project that already has a definition and names the ways to add', async () => {
    const target = new MemoryDefinitionSource({
      'document-type/mine.yaml': documentTypeFile('mine'),
    });
    const { outcome, written } = await run(target);
    expect(written).toEqual([]);
    if (outcome.status !== 'refused' || outcome.reason !== 'definitions-exist') {
      throw new Error('Expected a refusal because definitions exist.');
    }
    expect(outcome.hint).toContain('--add-missing');
    expect(outcome.hint).toContain('<kind>/<id>');
    expect(outcome.missing).toContain('specification-archetype/feature');
    expect(outcome.available).toHaveLength(12);
    expect(target.paths()).toEqual(['document-type/mine.yaml']);
  });

  it('refuses when only a template file is present (the owner has started a definitions tree)', async () => {
    const target = new MemoryDefinitionSource({
      'specification-archetype/templates/overview.md': 'edited by the owner',
    });
    const { outcome, written } = await run(target);
    expect(outcome.status).toBe('refused');
    expect(written).toEqual([]);
    expect(target.text('specification-archetype/templates/overview.md')).toBe(
      'edited by the owner',
    );
  });

  it('refuses before writing when a kind folder cannot be read safely', async () => {
    const target = new MemoryDefinitionSource();
    target.setUnsafeDirectory('document-type');
    const { outcome, written } = await run(target);
    expect(outcome).toMatchObject({
      status: 'refused',
      reason: 'target-unsafe',
      paths: ['document-type'],
    });
    expect(written).toEqual([]);
  });

  it('counts any entry below a kind folder as a started definitions tree', async () => {
    const target = new MemoryDefinitionSource({ 'document-type/README.md': 'x' });
    const { outcome, written } = await run(target);
    expect(outcome).toMatchObject({ status: 'refused', reason: 'definitions-exist' });
    expect(written).toEqual([]);
    // An unknown folder next to the kinds is not a definitions tree.
    const stray = new MemoryDefinitionSource({ 'notes/README.md': 'x' });
    expect((await run(stray)).written).toHaveLength(ALL_SEED_FILES);
  });

  it('never resurrects a definition the owner deleted', async () => {
    const target = new MemoryDefinitionSource();
    await run(target);
    target.delete('specification-archetype/feature.yaml');
    const second = await run(target);
    expect(second.outcome.status).toBe('refused');
    expect(target.has('specification-archetype/feature.yaml')).toBe(false);
  });
});

describe('install of named definitions', () => {
  it('installs an archetype with its document types and template file, dependencies first', async () => {
    const target = new MemoryDefinitionSource();
    const { outcome, written } = await run(target, {
      targets: ['specification-archetype/minimal'],
    });
    const plan = planOf(outcome);
    expect(plan.mode).toBe('explicit');
    expect(written).toEqual([
      'document-type/decisions.yaml',
      'document-type/note.yaml',
      'document-type/overview.yaml',
      'document-type/research.yaml',
      'specification-archetype/templates/overview.md',
      'specification-archetype/minimal.yaml',
    ]);
    expect(plan.items.filter((item) => item.requested).map((item) => item.path)).toEqual([
      'specification-archetype/templates/overview.md',
      'specification-archetype/minimal.yaml',
    ]);
    expect(await problemsOf(target)).toEqual([]);
  });

  it('adds a deleted definition back when it is named, on a project that has others', async () => {
    const target = new MemoryDefinitionSource();
    await run(target);
    target.delete('document-type/ux.yaml');
    const { written } = await run(target, { targets: ['document-type/ux'] });
    expect(written).toEqual(['document-type/ux.yaml']);
  });

  it('keeps an edited file unless forced, and reports it', async () => {
    const target = new MemoryDefinitionSource();
    await run(target);
    target.set('document-type/ux.yaml', documentTypeFile('ux', { title: 'My UX' }));

    const kept = await run(target, { targets: ['document-type/ux'] });
    expect(kept.written).toEqual([]);
    expect(actions(planOf(kept.outcome), 'skipped-edited')).toEqual(['document-type/ux.yaml']);
    expect(target.text('document-type/ux.yaml')).toContain('My UX');

    const forced = await run(target, { targets: ['document-type/ux'], force: true });
    expect(forced.written).toEqual(['document-type/ux.yaml']);
    expect(actions(planOf(forced.outcome), 'overwrite')).toEqual(['document-type/ux.yaml']);
    expect(target.text('document-type/ux.yaml')).not.toContain('My UX');
  });

  it('keeps an edited document type that an installed archetype depends on', async () => {
    const target = new MemoryDefinitionSource({
      'document-type/overview.yaml': documentTypeFile('overview', { title: 'Mine' }),
    });
    const { outcome } = await run(target, { targets: ['specification-archetype/minimal'] });
    const plan = planOf(outcome);
    expect(actions(plan, 'skipped-edited')).toEqual(['document-type/overview.yaml']);
    expect(target.text('document-type/overview.yaml')).toContain('Mine');
  });

  it('rejects a malformed target, an unknown kind and an unknown definition', async () => {
    const target = new MemoryDefinitionSource();
    const rejects = async (targets: string[], code: string) =>
      expect(run(target, { targets })).rejects.toMatchObject({
        name: 'DefinitionInstallError',
        code,
      });
    await rejects(['ux'], 'TARGET_INVALID');
    await rejects(['../x/y'], 'TARGET_INVALID');
    await rejects(['task-archetype/ux'], 'TARGET_INVALID');
    await rejects(['document-type/ghost'], 'SEED_NOT_FOUND');
    expect(target.paths()).toEqual([]);
  });
});

describe('add missing', () => {
  it('adds only what is absent and keeps edited files', async () => {
    const target = new MemoryDefinitionSource();
    await run(target);
    target.delete('document-type/ux.yaml');
    target.delete('specification-archetype/architecture.yaml');
    target.set('document-type/note.yaml', documentTypeFile('note', { title: 'My note' }));
    const { outcome, written } = await run(target, { addMissing: true });
    expect(planOf(outcome).mode).toBe('add-missing');
    expect([...written].sort()).toEqual([
      'document-type/ux.yaml',
      'specification-archetype/architecture.yaml',
    ]);
    expect(target.text('document-type/note.yaml')).toContain('My note');
  });

  it('with force restores every shipped file', async () => {
    const target = new MemoryDefinitionSource();
    await run(target);
    target.set('document-type/note.yaml', documentTypeFile('note', { title: 'My note' }));
    const { written } = await run(target, { addMissing: true, force: true });
    expect(written).toEqual(['document-type/note.yaml']);
    expect(target.text('document-type/note.yaml')).not.toContain('My note');
  });
});

describe('dry run and safety', () => {
  it('plans and writes nothing', async () => {
    const target = new MemoryDefinitionSource();
    const { outcome, written } = await run(target, { dryRun: true });
    expect(written).toEqual([]);
    expect(actions(planOf(outcome), 'create')).toHaveLength(ALL_SEED_FILES);
    expect(target.paths()).toEqual([]);
  });

  it('never writes to a path that is a symlink, even with force', async () => {
    const target = new MemoryDefinitionSource();
    target.setSymlink('document-type/note.yaml');
    const { outcome, written } = await run(target, {
      targets: ['document-type/note'],
      force: true,
    });
    expect(outcome).toMatchObject({
      status: 'refused',
      reason: 'target-unsafe',
      paths: ['document-type/note.yaml'],
    });
    expect(written).toEqual([]);
  });

  it('refuses the whole install when one planned path is blocked, even for the other files', async () => {
    const target = new MemoryDefinitionSource();
    target.setSymlink('specification-archetype/templates/overview.md');
    const { outcome, written } = await run(target, { addMissing: true });
    expect(outcome).toMatchObject({ status: 'refused', reason: 'target-unsafe' });
    expect(written).toEqual([]);
    expect(target.paths()).toEqual(['specification-archetype/templates/overview.md']);
  });

  it('never replaces a file that appeared between the plan and the write', async () => {
    const target = new MemoryDefinitionSource();
    const outcome = await planInstall({ seed, target, writer: target, registry });
    target.set('document-type/note.yaml', documentTypeFile('note', { title: 'Meanwhile' }));
    const { applyInstall } = await import('./install');
    await expect(applyInstall({ seed, writer: target }, planOf(outcome))).rejects.toMatchObject({
      code: 'INSTALL_WRITE_FAILED',
    });
    expect(target.text('document-type/note.yaml')).toContain('Meanwhile');
  });

  it('reports the files written before a write failure', async () => {
    const target = new MemoryDefinitionSource();
    let writes = 0;
    const failing: DefinitionWriter = {
      writeAtomic: async (path, bytes) => {
        writes += 1;
        if (writes === 3) throw new Error('disk full');
        await target.writeAtomic(path, bytes);
      },
    };
    const error = await run(target, {}, failing).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DefinitionInstallError);
    expect(error).toMatchObject({
      code: 'INSTALL_WRITE_FAILED',
      written: ['document-type/architecture.yaml', 'document-type/backend.yaml'],
    });
    expect((error as Error).message).toContain('disk full');
  });

  it('refuses to install from invalid seeds', async () => {
    const broken = new MemoryDefinitionSource({ 'document-type/overview.yaml': 'x: [' });
    await expect(
      planInstall({
        seed: broken,
        target: new MemoryDefinitionSource(),
        writer: new MemoryDefinitionSource(),
        registry,
      }),
    ).rejects.toMatchObject({ code: 'SEEDS_INVALID' });
  });
});
