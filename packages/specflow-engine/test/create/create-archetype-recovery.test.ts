// Linux-only integration (real Git, real files): recovery regenerates from the journal-pinned payload,
// never from the current code templates, and a crash between the payload write and the journal
// publication leaves only an orphan payload.
import { randomUUID } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse, stringify } from 'yaml';

const state = vi.hoisted(() => ({ failNextJournalPublish: false }));

vi.mock('../../src/project/fs/atomic-json', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/project/fs/atomic-json')>();

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
  installDefinitionsForTesting,
} from '../../src/testing';
import { CREATE_JOURNAL_RELATIVE_DIR } from '../../src/specs/create/journal';
import { createPayloadDirectory } from '../../src/specs/create/journal/payload';
import { createGitTestProject, git } from '../support/git-project';

const roots: string[] = [];
afterEach(async () => {
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
  const engine = await bootstrapProjectHome(root);
  // The definitions are installed (and committed) up front, so a test that notes HEAD before its first
  // Create sees the commit of the Create alone. A refusal (protected branch) surfaces from the Create.
  await installDefinitionsForTesting(engine).catch(() => undefined);

  return { root, engine };
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

/**
 * Edit the archetype files of the project the way an owner would: every archetype gets version 2 and
 * its templates new inline text, so the catalogue has another revision, other versions and other text.
 */
async function changeDefinitions(root: string): Promise<void> {
  const directory = join(root, '.nevo', 'definitions', 'specification-archetype');
  for (const name of (await readdir(directory)).filter((entry) => entry.endsWith('.yaml'))) {
    const file = parse(await readFile(join(directory, name), 'utf8')) as {
      version: number;
      templates: { content?: string; contentFile?: string }[];
    };
    file.version += 1;
    for (const template of file.templates) {
      delete template.contentFile;
      template.content = '# CHANGED {{specificationTitle}}\n';
    }

    await writeFile(join(directory, name), stringify(file, { lineWidth: 0 }));
  }
}

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

      await changeDefinitions(root); // the live catalogue differs now: other templates, version 2, new revision
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
      // The owner's edits of the definition files are the only uncommitted change.
      expect(
        git(root, 'status', '--porcelain', '--untracked-files=all')
          .split('\n')
          .filter((line) => line !== '' && !line.includes('.nevo/definitions/')),
      ).toEqual([]);
      const done = (await inspectCreateSpecification(engine, request.operationId))!;
      expect(done.catalogueRevision).toBe(pinnedRevision);
    },
    240000,
  );

  it('replays a completed Create after the catalogue changed, whatever the stale revision says', async () => {
    const { root, engine } = await project();
    const request = { ...input(engine, 'Replay after change') };
    const created = await createSpecification(engine, request);
    await changeDefinitions(root);
    expect(await createSpecification(engine, request)).toEqual(created);
    // The revision is a precondition of admission, not part of the operation identity.
    expect(
      await createSpecification(engine, {
        ...request,
        catalogueRevision: 'revision-of-the-old-catalogue',
      }),
    ).toEqual(created);
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
    const stale = 'f'.repeat(64);
    await writeFile(
      join(createPayloadDirectory(engine.context, request.operationId), stale),
      'stale',
    );
    // Nothing was written to the checkout and nothing is claimed.
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect((await readdir(directory)).sort()).toEqual([request.operationId + '.payload']);

    const created = await createSpecification(engine, request);
    expect(created.documentIds).toHaveLength(2);
    const payload = await readdir(createPayloadDirectory(engine.context, request.operationId));
    // The directory of the crashed attempt was replaced, not accumulated into.
    expect(payload).not.toContain(stale);
    expect(payload).toHaveLength(3);
  }, 240000);
});
