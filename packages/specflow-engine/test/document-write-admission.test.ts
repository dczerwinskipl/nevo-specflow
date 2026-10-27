// Integration (real Git project, real files): admission of a document change, the Git preflight
// cache and the manifest rule. Nothing is written by an admission, and a refusal leaves no trace.
import { randomUUID } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onPosix } from './support/platform';

import { sha256Hex } from '../src/hash';
import { withJournalLock, publishJournal, writePayload } from '../src/specs/durable';
import { deriveUnclassifiedDocumentId } from '../src/specs/document-rules/document-ids';
import { buildJournal } from '../src/specs/documents/changes/test-support';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../src/specs/documents/changes/journal/kind';
import { encodePlan } from '../src/specs/documents/changes/plan/codec';
import type { DocumentChangeRequest } from '../src/specs/documents/changes/plan/request';
import { admitDocumentChange } from '../src/specs/documents/write/admission';
import { readSpecificationDocumentTree } from '../src/specs/documents/tree-reader';
import { GitPreflightCache } from '../src/specs/documents/write/preflight-cache';
import { commitStaged, git } from './support/git-project';
import {
  documentsProject,
  failure,
  handBuiltSpecification,
  removeTrackedRoots,
  GIT_OFF,
} from './support/documents-fixture';

afterEach(removeTrackedRoots);

const GIT_ON = 'runtime: {}\ngit:\n  enabled: true\n';
const NOTES = 'notes\n';
const NOTES_REVISION = sha256Hex(NOTES);

/** A Git project on `feature/work` with a committed, hand-built Specification. */
async function workProject(config = GIT_ON) {
  const fixture = await documentsProject(config);
  git(fixture.root, 'checkout', '-q', '-b', 'feature/work');
  const spec = await handBuiltSpecification(fixture, {
    documents: [
      { id: 'overview', path: 'overview.md', type: 'overview' },
      { id: 'notes-1', path: 'notes.md', type: 'notes' },
    ],
    files: { 'overview.md': '# Hand\n', 'notes.md': NOTES },
  });
  git(fixture.root, 'add', 'specs');
  commitStaged(fixture.root, 'specification');
  return { ...fixture, ...spec };
}

const save = (content = 'notes changed\n'): DocumentChangeRequest => ({
  action: 'save',
  documentId: 'notes-1',
  content,
  expectedRevision: NOTES_REVISION,
});
const folder = (path: string): DocumentChangeRequest => ({ action: 'folder', path });

/** The Git processes the Engine starts while `run` executes (the spawn probe). */
async function gitProcessesDuring<T>(run: () => Promise<T>): Promise<{ result: T; count: number }> {
  let count = 0;
  const listener = (): void => {
    count += 1;
  };
  subscribe('nevo.specflow.engine.git-process', listener);
  try {
    return { result: await run(), count };
  } finally {
    unsubscribe('nevo.specflow.engine.git-process', listener);
  }
}

async function tree(path: string): Promise<string[]> {
  const entries = await readdir(path, { recursive: true });
  return entries.sort();
}

describe('admitDocumentChange: what an admission is', () => {
  it('plans a save against the Specification and writes nothing', async () => {
    const { root, engine, specId, dir } = await workProject();
    const before = await tree(root);
    const status = git(root, 'status', '--porcelain=v1', '--untracked-files=all');

    const admitted = await admitDocumentChange(engine, specId, save());

    expect(admitted.git).toEqual({ enabled: true, mode: 'auto', branch: 'feature/work' });
    expect(admitted.plan.paths.map((path) => path.path)).toEqual(['specs/active/hand/notes.md']);
    expect(admitted.manifestSha256).toBe(
      sha256Hex(await readFile(join(dir, 'specification.yaml'))),
    );
    expect(await tree(root)).toEqual(before);
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe(status);
    expect(existsSync(join(root, '.nevo', 'local', 'engine', 'operations', 'documents'))).toBe(
      false,
    );
  });

  it('starts no Git process when Git is disabled', async () => {
    const { engine, specId } = await workProject(GIT_OFF);
    const { result, count } = await gitProcessesDuring(() =>
      admitDocumentChange(engine, specId, save()),
    );
    expect(result.git).toEqual({ enabled: false });
    expect(count).toBe(0);
  });

  it('hashes a file larger than the hash limit that the request renames', async () => {
    const { engine, specId, dir } = await workProject(GIT_OFF);
    const content = Buffer.alloc(1_300_000, 'x');
    await writeFile(join(dir, 'big.bin'), content);
    const documentId = deriveUnclassifiedDocumentId('big.bin');

    const admitted = await admitDocumentChange(engine, specId, {
      action: 'rename',
      target: { kind: 'document', documentId },
      name: 'bigger.bin',
      expectedRevision: (await bigRevision(engine, specId)) ?? '',
    });

    const moved = admitted.plan.paths.find((path) => path.path.endsWith('bigger.bin'));
    expect(moved?.post).toEqual({ sha256: sha256Hex(content), bytes: content.length });
    const removed = admitted.plan.paths.find((path) => path.path.endsWith('big.bin'));
    expect(removed?.pre).toEqual({ sha256: sha256Hex(content), bytes: content.length });
  });
});

async function bigRevision(
  engine: Awaited<ReturnType<typeof workProject>>['engine'],
  specId: string,
): Promise<string | undefined> {
  const result = await readSpecificationDocumentTree(engine, specId);
  return result.documents.find((document) => document.path === 'big.bin')?.revision;
}

describe('admitDocumentChange: refusals leave nothing behind', () => {
  async function refused(run: () => Promise<unknown>, fixture: { root: string }): Promise<unknown> {
    const before = await tree(fixture.root);
    const status = git(fixture.root, 'status', '--porcelain=v1', '--untracked-files=all');
    const error = await failure(run());
    expect(await tree(fixture.root)).toEqual(before);
    expect(git(fixture.root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe(status);
    return error;
  }

  it('refuses an archived Specification', async () => {
    const fixture = await documentsProject(GIT_ON);
    const spec = await handBuiltSpecification(fixture, { location: 'archive', slug: 'old' });
    const error = await refused(
      () => admitDocumentChange(fixture.engine, spec.specId, folder('x')),
      fixture,
    );
    expect(error).toMatchObject({ code: 'SPEC_ARCHIVED' });
  });

  it('refuses a stale revision', async () => {
    const fixture = await workProject();
    const error = await refused(
      () =>
        admitDocumentChange(fixture.engine, fixture.specId, {
          ...(save() as Extract<DocumentChangeRequest, { action: 'save' }>),
          expectedRevision: 'f'.repeat(64),
        }),
      fixture,
    );
    expect(error).toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' });
  });

  it('refuses on a protected branch before anything is written', async () => {
    const fixture = await workProject(
      'runtime: {}\ngit:\n  enabled: true\n  commits:\n    protectedBranches: ["feature/**"]\n',
    );
    const error = await refused(
      () => admitDocumentChange(fixture.engine, fixture.specId, save()),
      fixture,
    );
    expect(error).toMatchObject({
      code: 'BRANCH_PROTECTED',
      details: { reason: 'branch-protected' },
    });
  });

  it('refuses a detached HEAD, a held index lock and an ignored path with the port reason', async () => {
    const fixture = await workProject();
    await writeFile(join(fixture.root, '.git', 'index.lock'), '');
    const locked = await refused(
      () => admitDocumentChange(fixture.engine, fixture.specId, save()),
      fixture,
    );
    expect(locked).toMatchObject({
      code: 'COMMIT_BLOCKED',
      details: { blockedBy: 'index-locked' },
    });
    await rm(join(fixture.root, '.git', 'index.lock'));

    await writeFile(join(fixture.root, '.gitignore'), '.nevo/local/\nnotes.md\n');
    git(fixture.root, 'add', '.gitignore');
    commitStaged(fixture.root, 'ignore');
    git(fixture.root, 'rm', '-q', '--cached', 'specs/active/hand/notes.md');
    commitStaged(fixture.root, 'untrack');
    const ignored = await refused(
      () => admitDocumentChange(fixture.engine, fixture.specId, save()),
      fixture,
    );
    expect(ignored).toMatchObject({
      code: 'COMMIT_BLOCKED',
      details: { blockedBy: 'path-ignored' },
    });

    git(fixture.root, 'checkout', '-q', '--detach');
    const detached = await refused(
      () => admitDocumentChange(fixture.engine, fixture.specId, save()),
      fixture,
    );
    expect(detached).toMatchObject({ code: 'COMMIT_BLOCKED', details: { blockedBy: 'detached' } });
  });

  it('refuses a path beyond the Windows bound before any Git process starts', async () => {
    const fixture = await workProject();
    const { count, result } = await gitProcessesDuring(() =>
      failure(
        admitDocumentChange(
          fixture.engine,
          fixture.specId,
          {
            action: 'create',
            documents: [{ path: `${'f'.repeat(100)}/${'g'.repeat(100)}.md`, content: 'x\n' }],
            folders: [],
          },
          { windows: { platform: 'win32' } },
        ),
      ),
    );
    expect(result).toMatchObject({
      code: 'DOCUMENT_PATH_INVALID',
      details: { cause: 'path-too-long' },
    });
    expect(count).toBe(0);
  });
});

describe('the Git preflight cache', () => {
  it('costs the port preflight on a miss and no Git process on a hit', async () => {
    const { engine, specId } = await workProject();
    const first = await gitProcessesDuring(() => admitDocumentChange(engine, specId, save()));
    expect(first.count).toBeGreaterThanOrEqual(4);
    expect(first.count).toBeLessThanOrEqual(6);

    const second = await gitProcessesDuring(() => admitDocumentChange(engine, specId, save('b\n')));
    expect(second.count).toBe(0);
    expect(second.result.git).toEqual({ enabled: true, mode: 'auto', branch: 'feature/work' });
  });

  it('is keyed by the path set: another set of paths is a miss', async () => {
    const { engine, specId } = await workProject();
    await admitDocumentChange(engine, specId, save());
    const other = await gitProcessesDuring(() =>
      admitDocumentChange(engine, specId, {
        action: 'create',
        documents: [{ path: 'fresh.md', content: 'x\n' }],
        folders: [],
      }),
    );
    expect(other.count).toBeGreaterThan(0);
  });

  it('expires after two seconds', async () => {
    const { engine, specId } = await workProject();
    let now = 0;
    const cache = new GitPreflightCache({ now: () => now });
    await admitDocumentChange(engine, specId, save(), { git: { cache } });
    now = 1999;
    expect(
      (
        await gitProcessesDuring(() =>
          admitDocumentChange(engine, specId, save(), { git: { cache } }),
        )
      ).count,
    ).toBe(0);
    now = 2001;
    expect(
      (
        await gitProcessesDuring(() =>
          admitDocumentChange(engine, specId, save(), { git: { cache } }),
        )
      ).count,
    ).toBeGreaterThan(0);
  });

  it('is invalidated by a branch change, by the index lock and by the project configuration', async () => {
    const fixture = await workProject();
    const { engine, specId, root } = fixture;
    await admitDocumentChange(engine, specId, save());

    // the branch moves: HEAD changes, the old verdict says nothing about the new branch
    git(root, 'checkout', '-q', '-b', 'feature/other');
    const moved = await gitProcessesDuring(() => admitDocumentChange(engine, specId, save()));
    expect(moved.count).toBeGreaterThan(0);
    expect(moved.result.git).toEqual({ enabled: true, mode: 'auto', branch: 'feature/other' });
    expect(
      (await gitProcessesDuring(() => admitDocumentChange(engine, specId, save()))).count,
    ).toBe(0);

    // a lock appears: the cached verdict is not served and the port refuses
    await writeFile(join(root, '.git', 'index.lock'), '');
    expect(await failure(admitDocumentChange(engine, specId, save()))).toMatchObject({
      code: 'COMMIT_BLOCKED',
      details: { blockedBy: 'index-locked' },
    });
    await rm(join(root, '.git', 'index.lock'));

    // the policy changes after a hit: protection takes effect at once
    await admitDocumentChange(engine, specId, save());
    await writeFile(
      join(root, '.nevo', 'config.yaml'),
      'runtime: {}\ngit:\n  enabled: true\n  commits:\n    protectedBranches: ["feature/**"]\n',
    );
    const stamp = new Date(Date.now() + 10_000);
    await utimes(join(root, '.nevo', 'config.yaml'), stamp, stamp);
    expect(await failure(admitDocumentChange(engine, specId, save()))).toMatchObject({
      code: 'BRANCH_PROTECTED',
    });
  });
});

describe('SPEC_MANIFEST_DIRTY', () => {
  /** Reserves, as the writer will, an operation whose plan came from `request`; returns its id. */
  async function pend(
    fixture: Awaited<ReturnType<typeof workProject>>,
    request: DocumentChangeRequest,
    stage: 'queued' | 'files-writing',
    sequence: number,
    applyManifest: boolean,
  ): Promise<string> {
    const admitted = await admitDocumentChange(fixture.engine, fixture.specId, request);
    const encoded = encodePlan(admitted.plan);
    const operationId = randomUUID();
    const manifest = admitted.payloads.find(
      (payload) =>
        payload.sha256 ===
        admitted.plan.paths.find((path) => path.role === 'manifest')?.post?.sha256,
    );
    await withJournalLock(fixture.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
      await writePayload(fixture.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId, [
        { sha256: encoded.sha256, content: encoded.text },
      ]);
      await publishJournal(
        fixture.engine.context,
        DOCUMENT_CHANGE_JOURNAL_KIND,
        buildJournal(stage, {
          operationId,
          projectId: fixture.engine.context.project.projectId,
          specId: fixture.specId,
          slug: 'hand',
          workspaceId: admitted.loaded.workspaceId,
          workspaceRoot: fixture.root,
          action: 'folder',
          sequence,
          plan: {
            sha256: encoded.sha256,
            bytes: encoded.bytes,
            pathCount: admitted.plan.paths.length,
            documentCount: 0,
          },
        }),
      );
    });
    if (applyManifest && manifest) {
      await writeFile(join(fixture.dir, 'specification.yaml'), manifest.content);
    }
    return operationId;
  }

  it('accepts a registry change on a manifest that is clean in Git', async () => {
    const { engine, specId } = await workProject();
    const admitted = await admitDocumentChange(engine, specId, folder('plans'));
    expect(admitted.plan.paths.map((path) => path.role)).toEqual(['manifest']);
  });

  it('refuses it when the manifest has uncommitted edits and Git is enabled', async () => {
    const { engine, specId, dir } = await workProject();
    const text = await readFile(join(dir, 'specification.yaml'), 'utf8');
    await writeFile(join(dir, 'specification.yaml'), text + '# edited by hand\n');
    expect(await failure(admitDocumentChange(engine, specId, folder('plans')))).toMatchObject({
      code: 'SPEC_MANIFEST_DIRTY',
    });
    // a change that does not touch the registry is not judged
    await expect(admitDocumentChange(engine, specId, save())).resolves.toBeDefined();
  });

  it('has nothing to compare with when Git is disabled', async () => {
    const { engine, specId, dir } = await workProject(GIT_OFF);
    const text = await readFile(join(dir, 'specification.yaml'), 'utf8');
    await writeFile(join(dir, 'specification.yaml'), text + '# edited by hand\n');
    await expect(admitDocumentChange(engine, specId, folder('plans'))).resolves.toBeDefined();
  });

  it('judges against the post-image of the latest pending operation, not against HEAD', async () => {
    const fixture = await workProject();
    await pend(fixture, folder('first'), 'queued', 1, true);
    // the disk differs from HEAD but equals the pending operation's post-image: clean
    const admitted = await admitDocumentChange(fixture.engine, fixture.specId, folder('second'));
    expect(admitted.plan.paths.map((path) => path.role)).toEqual(['manifest']);

    // an outside edit on top of the pending change is dirty
    const text = await readFile(join(fixture.dir, 'specification.yaml'), 'utf8');
    await writeFile(join(fixture.dir, 'specification.yaml'), text + '# edited by hand\n');
    expect(
      await failure(admitDocumentChange(fixture.engine, fixture.specId, folder('third'))),
    ).toMatchObject({ code: 'SPEC_MANIFEST_DIRTY' });
  });

  it('uses the latest pending operation by sequence and counts every non-terminal stage', async () => {
    const fixture = await workProject();
    await pend(fixture, folder('first'), 'queued', 1, true);
    const second = await pend(fixture, folder('second'), 'queued', 2, false);
    // the second operation's post-image is not on disk: the manifest is behind the latest one
    expect(second).toBeDefined();
    expect(
      await failure(admitDocumentChange(fixture.engine, fixture.specId, folder('third'))),
    ).toMatchObject({ code: 'SPEC_MANIFEST_DIRTY' });
  });

  it('answers busy while the latest operation is still writing the manifest', async () => {
    const fixture = await workProject();
    await pend(fixture, folder('first'), 'files-writing', 1, false);
    expect(
      await failure(admitDocumentChange(fixture.engine, fixture.specId, folder('second'))),
    ).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'manifest-changed' } });
  });
});

describe.skipIf(!onPosix)('the save budget (Linux)', () => {
  it('admits a save in under 150 ms at p95 on a cache hit, without a Git process', async () => {
    const { engine, specId } = await workProject();
    await admitDocumentChange(engine, specId, save());
    const samples: number[] = [];
    const { count } = await gitProcessesDuring(async () => {
      for (let index = 0; index < 100; index += 1) {
        const started = performance.now();
        await admitDocumentChange(engine, specId, save(`content ${index}\n`));
        samples.push(performance.now() - started);
      }
    });
    samples.sort((a, b) => a - b);
    expect(count).toBe(0);
    expect(samples[Math.floor(samples.length * 0.95) - 1]!).toBeLessThan(150);
  }, 60_000);
});
