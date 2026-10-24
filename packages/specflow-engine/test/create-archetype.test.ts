// Linux-only integration (real Git, real files): Create with an archetype writes N scaffold files
// and commits them in ONE Engine-owned commit.
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting as createSpecification,
  inspectCreateSpecification,
  parseSpecificationManifestText,
  type CreateSpecificationInput,
  type SpecFlowEngine,
} from '../src/testing';
import { getBuiltInCatalogue } from '../src/specs/archetypes/catalogue';
import { validateDocuments } from '../src/specs/documents/document-validation';
import { CREATE_JOURNAL_RELATIVE_DIR } from '../src/specs/create/journal';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

const GIT_CONFIG = 'runtime: {}\ngit:\n  enabled: true\n';
const catalogue = getBuiltInCatalogue();

async function project(config = GIT_CONFIG): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject('specflow-create-archetype-', config);
  roots.push(root, root + '-worktrees');
  git(root, 'checkout', '-q', '-b', 'develop');
  return { root, engine: await bootstrapProjectHome(root) };
}

function request(
  engine: SpecFlowEngine,
  title: string,
  patch: Partial<CreateSpecificationInput> = {},
): CreateSpecificationInput {
  return {
    operationId: randomUUID(),
    title,
    created: '2026-10-24',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    ...patch,
  };
}

const committedPaths = (root: string, sha: string): string[] =>
  git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n').sort();

async function manifestOf(root: string, relativeManifestPath: string) {
  const slug = relativeManifestPath.split('/')[2]!;
  return parseSpecificationManifestText(
    await readFile(join(root, relativeManifestPath), 'utf8'),
    slug,
    'active',
  );
}

describe('Create with an archetype: one commit for the whole scaffold', () => {
  it.each(['minimal', 'feature', 'architecture'])(
    '%s: commits exactly the scaffold files, leaves a clean tree and returns the ids',
    async (archetypeId) => {
      const { root, engine } = await project();
      const parent = git(root, 'rev-parse', 'HEAD');
      const archetype = catalogue.findArchetype(archetypeId)!;
      const suggested = archetype.templates
        .filter((template) => template.include === 'optional' && template.preselected)
        .map((template) => template.id);
      const input = request(engine, 'Archetype ' + archetypeId, {
        archetype: { id: archetypeId, version: archetype.version },
        catalogueRevision: catalogue.revision,
        optionalDocumentIds: suggested,
      });
      const created = await createSpecification(engine, input);

      expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
      const sha = git(root, 'rev-parse', 'HEAD');
      const base = 'specs/active/' + created.slug + '/';
      const expectedFiles = [
        'specification.yaml',
        ...archetype.templates
          .filter((template) => template.include === 'always' || suggested.includes(template.id))
          .map((template) => template.filename),
      ].map((name) => base + name);
      expect(committedPaths(root, sha)).toEqual(expectedFiles.sort());
      expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');

      const manifest = await manifestOf(root, created.relativeManifestPath);
      expect(manifest.archetype).toMatchObject({ id: archetypeId, version: archetype.version });
      expect(manifest.documents.map((document) => document.id)).toEqual(created.documentIds);
      expect(manifest.documents).toHaveLength(1 + suggested.length);
      // Completeness of a new Specification equals the archetype's requirements.
      const validation = validateDocuments({
        archetype: manifest.archetype,
        documents: manifest.documents,
        observedPaths: manifest.documents.map((document) => document.path),
      });
      expect(validation.complete).toBe(true);
      expect(manifest.archetype.requirements).toEqual(archetype.requirements);
      expect(validation.issues).toEqual([]);

      const journal = await inspectCreateSpecification(engine, input.operationId);
      expect(journal?.stage).toBe('completed');
      expect(journal?.catalogueRevision).toBe(catalogue.revision);
      expect(journal?.documentIds).toEqual(created.documentIds);
      expect(journal?.files.map((file) => file.relativePath).sort()).toEqual(expectedFiles);
    },
    240000,
  );

  it('registers typed added documents, leaves untyped ones unclassified and creates nested directories', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const created = await createSpecification(
      engine,
      request(engine, 'Added documents', {
        archetype: { id: 'feature', version: 1 },
        optionalDocumentIds: ['ux'],
        addedDocuments: [
          { path: 'notes/deep/idea.md', type: 'note', content: '# Idea €\n' },
          { path: 'raw/data.txt', content: 'untyped' },
        ],
        folders: ['assets/empty'],
      }),
    );
    const manifest = await manifestOf(root, created.relativeManifestPath);
    const base = 'specs/active/' + created.slug + '/';
    expect(manifest.documents.map((document) => document.path)).toEqual([
      'overview.md',
      'ux.md',
      'notes/deep/idea.md',
    ]);
    expect(manifest.documents[2]).toMatchObject({ type: 'note' });
    expect(created.documentIds).toHaveLength(3);
    // The untyped file is a committed file that no registry entry names.
    expect(committedPaths(root, 'HEAD')).toContain(base + 'raw/data.txt');
    expect(manifest.documents.some((document) => document.path === 'raw/data.txt')).toBe(false);
    expect(await readFile(join(root, base + 'notes/deep/idea.md'), 'utf8')).toBe('# Idea €\n');
    // An empty folder exists only in the manifest: nothing on disk and nothing in the commit.
    expect(manifest.folders).toEqual(['assets/empty']);
    await expect(stat(join(root, base + 'assets'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(committedPaths(root, 'HEAD').some((path) => path.includes('assets'))).toBe(false);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  }, 240000);

  it('replays to the same result, and a different archetype or content under the same id conflicts', async () => {
    const { root, engine } = await project();
    const input = request(engine, 'Replayed', {
      archetype: { id: 'feature', version: 1 },
      optionalDocumentIds: ['behaviour'],
      addedDocuments: [{ path: 'a.md', type: 'note', content: 'one' }],
    });
    const created = await createSpecification(engine, input);
    const head = git(root, 'rev-parse', 'HEAD');
    expect(await createSpecification(engine, input)).toEqual(created);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);

    for (const patch of [
      { archetype: { id: 'minimal', version: 1 } },
      { optionalDocumentIds: ['ux'] },
      { addedDocuments: [{ path: 'a.md', type: 'note', content: 'two' }] },
      { folders: ['x'] },
    ]) {
      await expect(createSpecification(engine, { ...input, ...patch })).rejects.toMatchObject({
        code: 'CREATE_CONFLICT',
      });
    }
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  }, 240000);

  it('writes nothing when admission fails', async () => {
    const { root, engine } = await project();
    const head = git(root, 'rev-parse', 'HEAD');
    const registry = await engine.readRegistry();
    const bad: Partial<CreateSpecificationInput>[] = [
      { catalogueRevision: 'stale' },
      { archetype: { id: 'minimal', version: 9 } },
      { archetype: { id: 'nope', version: 1 } },
      { optionalDocumentIds: ['missing'] },
      { addedDocuments: [{ path: 'specification.yaml', content: '' }] },
      {
        addedDocuments: [
          { path: 'a.md', content: '' },
          { path: 'A.md', content: '' },
        ],
      },
      { addedDocuments: [{ path: 'n.md', content: '€'.repeat(400_000) }] },
    ];
    const codes = [
      'CATALOGUE_STALE',
      'CATALOGUE_STALE',
      'ARCHETYPE_UNKNOWN',
      'ARCHETYPE_UNKNOWN',
      'DOCUMENT_PATH_INVALID',
      'DOCUMENT_PATH_CONFLICT',
      'DOCUMENT_OPERATION_INVALID',
    ];
    for (const [index, patch] of bad.entries()) {
      await expect(
        createSpecification(engine, request(engine, 'Refused ' + index, patch)),
      ).rejects.toMatchObject({ code: codes[index] });
    }
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    await expect(stat(join(root, 'specs'))).rejects.toMatchObject({ code: 'ENOENT' });
    const directory = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
    expect(await readdir(directory).catch(() => [])).toEqual([]);
    expect(await engine.readRegistry()).toEqual(registry);
  }, 240000);

  it('refuses a protected branch before writing anything, payload included', async () => {
    const { root, engine } = await project(
      GIT_CONFIG + '  commits:\n    protectedBranches: [develop]\n',
    );
    await expect(
      createSpecification(
        engine,
        request(engine, 'Protected', { archetype: { id: 'feature', version: 1 } }),
      ),
    ).rejects.toMatchObject({ code: 'BRANCH_PROTECTED' });
    const directory = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
    expect(await readdir(directory).catch(() => [])).toEqual([]);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  }, 240000);

  it('creates the whole scaffold without a commit when Git is disabled', async () => {
    const { root, engine } = await project('runtime: {}\ngit:\n  enabled: false\n');
    const head = git(root, 'rev-parse', 'HEAD');
    const created = await createSpecification(
      engine,
      request(engine, 'No git', {
        archetype: { id: 'feature', version: 1 },
        optionalDocumentIds: ['ux', 'backend'],
        addedDocuments: [{ path: 'extra/n.md', type: 'note', content: 'n' }],
      }),
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    const base = 'specs/active/' + created.slug + '/';
    for (const name of ['specification.yaml', 'overview.md', 'ux.md', 'backend.md', 'extra/n.md']) {
      expect((await stat(join(root, base + name))).isFile()).toBe(true);
    }
    expect((await inspectCreateSpecification(engine, created.operationId))?.commit).toBeUndefined();
  }, 240000);

  it('refuses a redirected nested directory instead of writing through it', async () => {
    const { root, engine } = await project('runtime: {}\ngit:\n  enabled: false\n');
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'specflow-outside-')));
    roots.push(outside);
    const input = request(engine, 'Redirected', {
      addedDocuments: [{ path: 'notes/a.md', content: 'x' }],
    });
    class Stop extends Error {}
    let slug = '';
    await expect(
      createSpecification(engine, input, {
        afterEffect: async (effect) => {
          if (effect !== 'reservation') return;
          slug = (await inspectCreateSpecification(engine, input.operationId))!.slug;
          throw new Stop();
        },
      }),
    ).rejects.toBeInstanceOf(Stop);
    const specDirectory = join(root, 'specs/active', slug);
    await mkdir(specDirectory, { recursive: true });
    await symlink(outside, join(specDirectory, 'notes'), 'dir');
    await expect(
      createSpecification(engine, input, { resumeInterruptedOperation: true }),
    ).rejects.toMatchObject({ code: 'CREATE_RECOVERY_REQUIRED' });
    expect(await readdir(outside)).toEqual([]);
  }, 240000);
});

describe('Create with an archetype: recovery uses the full recorded list', () => {
  class Crash extends Error {}
  const crashAfter = (stage: string) => (effect: string) =>
    effect === stage ? Promise.reject(new Crash(stage)) : Promise.resolve();
  const full = (engine: SpecFlowEngine, title: string): CreateSpecificationInput =>
    request(engine, title, {
      archetype: { id: 'feature', version: 1 },
      optionalDocumentIds: ['behaviour', 'ux', 'backend'],
      addedDocuments: [{ path: 'notes/a.md', type: 'note', content: 'a' }],
      folders: ['assets'],
    });

  it.each(['manifest', 'commit', 'registry'])(
    'resumes after a crash at %s with exactly one commit of every file',
    async (stage) => {
      const { root, engine } = await project();
      const parent = git(root, 'rev-parse', 'HEAD');
      const input = full(engine, 'Crash at ' + stage);
      await expect(
        createSpecification(engine, input, { afterEffect: crashAfter(stage) }),
      ).rejects.toBeInstanceOf(Crash);
      const resumed = await createSpecification(engine, input, {
        resumeInterruptedOperation: true,
      });

      expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
      const base = 'specs/active/' + resumed.slug + '/';
      expect(committedPaths(root, 'HEAD')).toEqual(
        ['specification.yaml', 'overview.md', 'behaviour.md', 'ux.md', 'backend.md', 'notes/a.md']
          .map((name) => base + name)
          .sort(),
      );
      expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
      expect(resumed.documentIds).toHaveLength(5);
    },
    240000,
  );

  it('accepts a byte-identical, clean human commit of the full list instead of committing again', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = full(engine, 'Human committed');
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('manifest') }),
    ).rejects.toBeInstanceOf(Crash);
    const journal = (await inspectCreateSpecification(engine, input.operationId))!;
    git(root, 'add', '--', ...journal.files.map((file) => file.relativePath));
    git(
      root,
      '-c',
      'user.name=Human',
      '-c',
      'user.email=human@example.invalid',
      'commit',
      '-qm',
      'authored by hand',
    );
    const human = git(root, 'rev-parse', 'HEAD');
    await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(human);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
  }, 240000);

  it('completes after an interrupt with a file opened but not yet written', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = full(engine, 'Opened not written');
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('manifest-opened') }),
    ).rejects.toBeInstanceOf(Crash);
    const journal = (await inspectCreateSpecification(engine, input.operationId))!;
    // The visible manifest is never partial: only a staged file exists.
    await expect(stat(join(root, journal.files[0]!.relativePath))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const resumed = await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    expect(resumed.documentIds).toHaveLength(5);
    const names = await readdir(join(root, 'specs/active', resumed.slug));
    expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  }, 240000);

  it.each([1, 2, 3])(
    'completes after an interrupt between file %i and the next',
    async (count) => {
      const { root, engine } = await project();
      const parent = git(root, 'rev-parse', 'HEAD');
      const input = full(engine, 'Between files ' + String(count));
      let seen = 0;
      await expect(
        createSpecification(engine, input, {
          afterEffect: (effect) => {
            if (effect === 'file' && ++seen === count) return Promise.reject(new Crash('file'));
            return Promise.resolve();
          },
        }),
      ).rejects.toBeInstanceOf(Crash);
      await createSpecification(engine, input, { resumeInterruptedOperation: true });
      expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
      expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    },
    240000,
  );

  it('completes a file that an earlier interrupted write left empty or partial', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = full(engine, 'Legacy partial');
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('manifest-opened') }),
    ).rejects.toBeInstanceOf(Crash);
    const journal = (await inspectCreateSpecification(engine, input.operationId))!;
    const directory = join(root, 'specs/active', journal.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(join(root, journal.files[0]!.relativePath), '');
    await writeFile(
      join(root, journal.files[1]!.relativePath),
      '---' + String.fromCharCode(10) + 'id: spec.',
    );
    await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  }, 240000);

  it('refuses to adopt a partly changed scaffold', async () => {
    const { root, engine } = await project();
    const input = full(engine, 'Tampered');
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('manifest') }),
    ).rejects.toBeInstanceOf(Crash);
    const journal = (await inspectCreateSpecification(engine, input.operationId))!;
    const tampered = journal.files.find((file) => file.relativePath.endsWith('/ux.md'))!;
    await writeFile(join(root, tampered.relativePath), 'edited by someone else\n');
    await expect(
      createSpecification(engine, input, { resumeInterruptedOperation: true }),
    ).rejects.toMatchObject({ code: 'CREATE_RECOVERY_REQUIRED' });
  }, 240000);
});
