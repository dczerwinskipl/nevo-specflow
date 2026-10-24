// Linux-only integration (real Git, real files): recovery regenerates from the journal-pinned payload,
// never from the current code templates, and a crash between the payload write and the journal
// publication leaves only an orphan payload.
import { randomUUID } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ changed: false, failNextJournalPublish: false }));

vi.mock('../src/specs/archetypes/catalogue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/specs/archetypes/catalogue')>();
  const { BUILT_IN_DEFINITIONS } = await import('../src/specs/archetypes/builtins');
  const changedDefinitions = structuredClone(BUILT_IN_DEFINITIONS);
  for (const archetype of changedDefinitions.archetypes ?? []) {
    archetype.version += 1;
    for (const template of archetype.templates) {
      template.content = '# CHANGED {{specificationTitle}}\n';
    }
  }
  const changed = actual.resolveCatalogue(changedDefinitions);
  return {
    ...actual,
    getBuiltInCatalogue: () => (state.changed ? changed : actual.getBuiltInCatalogue()),
  };
});

vi.mock('../src/project/fs/atomic-json', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/project/fs/atomic-json')>();
  return {
    ...actual,
    writeJsonAtomically: async (path: string, document: unknown, options?: never) => {
      if (state.failNextJournalPublish && path.includes('operations') && path.endsWith('.json')) {
        state.failNextJournalPublish = false;
        throw new Error('simulated crash before the journal was published');
      }
      return actual.writeJsonAtomically(path, document, options);
    },
  };
});

import {
  bootstrapProjectHome,
  createSpecificationForTesting as createSpecification,
  inspectCreateSpecification,
  type CreateSpecificationInput,
  type SpecFlowEngine,
} from '../src/testing';
import { CREATE_JOURNAL_RELATIVE_DIR } from '../src/specs/create/journal';
import { createPayloadDirectory } from '../src/specs/create/journal/payload';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  state.changed = false;
  state.failNextJournalPublish = false;
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function project(): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'specflow-create-pinned-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root, root + '-worktrees');
  git(root, 'checkout', '-q', '-b', 'develop');
  return { root, engine: await bootstrapProjectHome(root) };
}

const input = (engine: SpecFlowEngine, title: string): CreateSpecificationInput => ({
  operationId: randomUUID(),
  title,
  created: '2026-10-24',
  archetype: { id: 'feature', version: 1 },
  optionalDocumentIds: ['ux'],
  target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
});

class Crash extends Error {}

describe('recovery is independent of the live catalogue', () => {
  it.each(['manifest', 'commit', 'registry'])(
    'resumes a crash at %s with the originally recorded content when templates, version and revision changed',
    async (stage) => {
      const { root, engine } = await project();
      const request = input(engine, 'Pinned content');
      await expect(
        createSpecification(engine, request, {
          afterEffect: (effect) =>
            effect === stage ? Promise.reject(new Crash()) : Promise.resolve(),
        }),
      ).rejects.toBeInstanceOf(Crash);
      const journal = (await inspectCreateSpecification(engine, request.operationId))!;
      const pinnedRevision = journal.catalogueRevision;

      state.changed = true; // the live catalogue differs now: other templates, version 2, new revision
      const resumed = await createSpecification(engine, request, {
        resumeInterruptedOperation: true,
      });

      const overview = await readFile(
        join(root, 'specs/active', resumed.slug, 'overview.md'),
        'utf8',
      );
      expect(overview).toContain('Pinned content');
      expect(overview).not.toContain('CHANGED');
      const manifest = await readFile(join(root, resumed.relativeManifestPath), 'utf8');
      expect(manifest).toMatch(/version: 1/u);
      expect(git(root, 'log', '-1', '--format=%s')).toBe('spec(create): ' + resumed.slug);
      expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
      const done = (await inspectCreateSpecification(engine, request.operationId))!;
      expect(done.catalogueRevision).toBe(pinnedRevision);
    },
    240000,
  );

  it('replays a completed Create after the catalogue changed, whatever the stale revision says', async () => {
    const { engine } = await project();
    const request = { ...input(engine, 'Replay after change') };
    const created = await createSpecification(engine, request);
    state.changed = true;
    expect(await createSpecification(engine, request)).toEqual(created);
    // A NEW operation naming the old version is refused against the changed catalogue.
    await expect(createSpecification(engine, input(engine, 'New one'))).rejects.toMatchObject({
      code: 'CATALOGUE_STALE',
    });
  }, 240000);
});

describe('crash between the payload write and the journal publication', () => {
  it('leaves only an orphan payload, which a retry of the same operation replaces', async () => {
    const { root, engine } = await project();
    const request = input(engine, 'Crash before publish');
    state.failNextJournalPublish = true;
    await expect(createSpecification(engine, request)).rejects.toThrow(/simulated crash/u);

    const directory = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
    expect(await inspectCreateSpecification(engine, request.operationId)).toBeUndefined();
    const orphan = await readdir(createPayloadDirectory(engine.context, request.operationId));
    expect(orphan.length).toBeGreaterThan(0);
    // Nothing was written to the checkout and nothing is claimed.
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect((await readdir(directory)).sort()).toEqual([request.operationId + '.payload']);

    const created = await createSpecification(engine, request);
    expect(created.documentIds).toHaveLength(2);
    const payload = await readdir(createPayloadDirectory(engine.context, request.operationId));
    // The retry reserved a fresh specId, so the old payload files were replaced, not accumulated.
    expect(payload.some((name) => orphan.includes(name))).toBe(false);
    expect(payload).toHaveLength(3);
  }, 240000);
});
