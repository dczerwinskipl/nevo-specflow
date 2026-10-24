import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { parse, stringify } from 'yaml';

import type { SpecFlowEngine } from '../../application';
import { executeGitMutation } from '../../git/mutation';
import { executeGit } from '../../git/process';
import { publishCloseCheckpoint } from './close/checkpoint';
import {
  inspectRegisteredWorkspace,
  readWorkspaceRegistry,
} from '../../project/workspace/registry/registry';
import { renameWindowsSafe } from '../../project/fs/windows-safe-fs';
import { inspectCleanGitWorkspace } from './preflight';
import { disabledIntegrationHooksDirectory } from './git/scratch';
import { readCloseJournal } from './journal/store';
import {
  CloseOperationError,
  type CloseJournal,
  type CloseArchiveEvidence,
  type CloseArchiveInventory,
} from './model';

function failure(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}
function invalid(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_PREFLIGHT', message);
}
function digest(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function expectedFile(path: string): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw invalid('Archive source contains redirected/non-file data.');
  if (stat.size > 32 * 1024 * 1024)
    throw invalid('Archive source file exceeds bounded inventory size.');
  return readFile(path);
}

async function physicalInventory(root: string, relative: string): Promise<CloseArchiveInventory[]> {
  const folder = join(root, relative);
  const stat = await lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(folder)) !== folder)
    throw invalid('Archive directory is missing or redirected.');
  const files: CloseArchiveInventory[] = [];
  async function visit(rel: string): Promise<void> {
    for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
      if (e.isSymbolicLink() || (!e.isDirectory() && !e.isFile()))
        throw invalid('Archive inventory contains a symlink or special file.');
      const path = rel + '/' + e.name;
      if (e.isDirectory()) await visit(path);
      else {
        if (files.length >= 4096) throw invalid('Archive inventory file limit exceeded.');
        files.push({ relativePath: path, sha256: digest(await expectedFile(join(root, path))) });
      }
    }
  }
  await visit(relative);
  // The durable journal validator orders portable paths by code-unit order,
  // not locale collation (which may disagree for punctuation or case).
  return files.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
}

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await executeGit(root, args);
  if (result.exitCode !== 0) throw failure('Cannot independently verify Git archive state.');
  return result.stdout.trim();
}
async function gitRaw(root: string, args: readonly string[]): Promise<string> {
  const result = await executeGit(root, args);
  if (result.exitCode !== 0) throw invalid('Archive Git tracking state is unavailable.');
  return result.stdout;
}
async function absent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'ENOENT') return true;
    throw e;
  }
}
function destinationPath(inventory: CloseArchiveEvidence, old: string): string {
  return inventory.destinationPath + old.slice(inventory.sourcePath.length);
}
function plannedArchivePaths(inventory: CloseArchiveEvidence): readonly string[] {
  return inventory.files.map((x) => x.relativePath);
}
/**
 * The archived manifest: the parsed source with only `status` replaced, so `archetype`, `documents`,
 * `folders` and any unknown top-level key survive archival unchanged.
 */
export function archivedManifestText(parsed: object): string {
  return stringify({ ...parsed, status: 'archived' });
}

async function assertArchivedFiles(root: string, archive: CloseArchiveEvidence): Promise<void> {
  if (!(await absent(join(root, archive.sourcePath))))
    throw failure('Active source still exists after archival.');
  const expected = archive.files.map((file) => ({
    relativePath: destinationPath(archive, file.relativePath),
    sha256: file.relativePath.endsWith('/specification.yaml')
      ? archive.archivedManifestSha256
      : file.sha256,
  }));
  const observed = await physicalInventory(root, archive.destinationPath);
  if (!isDeepStrictEqual(observed, expected))
    throw failure('Archived file inventory differs from durable intent.');
  const manifest = parse(
    await readFile(join(root, archive.destinationPath, 'specification.yaml'), 'utf8'),
  ) as unknown;
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('status' in manifest) ||
    manifest.status !== 'archived'
  )
    throw failure('Archived manifest does not declare archived status.');
}

async function publish(
  engine: SpecFlowEngine,
  old: CloseJournal,
  next: CloseJournal,
): Promise<CloseJournal> {
  return publishCloseCheckpoint(engine, old, next, {
    onConflict: 'Concurrent Close archive journal modification.',
    onConflictCode: 'CLOSE_RECOVERY_REQUIRED',
    onReadbackFailure: 'Archive journal checkpoint was not durable.',
    verifyCurrent: async () => {
      const registry = await readWorkspaceRegistry(engine.context);
      if (registry.revision !== old.plan.registryRevision)
        throw failure('Registry revision changed during archival.');
    },
  });
}

/** An Engine-only archive operation, before any Specification Close settlement. */
export async function archiveSpecificationWithCommit(
  engine: SpecFlowEngine,
  operationId: string,
  afterArchiveIntent?: () => Promise<void>,
  afterArchiveCommit?: () => Promise<void>,
  afterArchiveMove?: () => Promise<void>,
  afterScopedStaging?: () => Promise<void>,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (
    record?.stage !== 'reserved' ||
    record.plan.kind !== 'specification-close' ||
    record.plan.location !== 'active'
  )
    throw invalid('Archive requires an unmodified reserved Specification Close.');
  // Validate an Engine-owned, empty, non-symlinked hooksPath BEFORE moving
  // archive files. Never point internal commits at a potentially executable
  // repository hook, including after an untrusted filesystem replacement.
  const disabledHooksDirectory = await disabledIntegrationHooksDirectory(engine);
  const source = record.plan.source;
  const registry = await engine.readRegistry();
  if (registry.revision !== record.plan.registryRevision)
    throw invalid('Registry changed after reservation.');
  const actual = await inspectRegisteredWorkspace(engine.context, registry, source.workspaceId);
  if (actual.status !== 'available' || actual.root !== source.root)
    throw invalid('Canonical source checkout unavailable.');
  const facts = await inspectCleanGitWorkspace(actual.workspace);
  if (
    facts.head !== source.head ||
    facts.branch !== source.branch ||
    facts.instanceId !== source.instanceId
  )
    throw invalid('Source Git commit or physical incarnation changed.');
  const oldPath = 'specs/active/' + record.plan.slug;
  const newPath = 'specs/archive/' + record.plan.slug;
  if (!(await absent(join(source.root, newPath))))
    throw invalid('Archive destination already exists; never overwrite.');

  const files = await physicalInventory(source.root, oldPath);
  if (!files.some((x) => x.relativePath === oldPath + '/specification.yaml'))
    throw invalid('Canonical specification.yaml missing.');
  if (files.some((x) => x.relativePath.endsWith('/change.yaml')))
    throw invalid('Obsolete change.yaml cannot be archived.');
  // Explicitly disallow ignored/untracked files: every physical file must be
  // indexed in Git at the pinned commit, including ancillary directories.
  const tracked = (await gitRaw(source.root, ['ls-files', '-z', '--', oldPath]))
    .split('\0')
    .filter(Boolean)
    .sort();
  if (
    !isDeepStrictEqual(
      tracked,
      plannedArchivePaths({
        sourceCommit: source.head,
        sourcePath: oldPath,
        destinationPath: newPath,
        files,
        archivedManifestSha256: '0'.repeat(64),
      })
        .slice()
        .sort(),
    )
  )
    throw invalid('Archive directory contains ignored or non-versioned data.');

  const sourceManifest = await readFile(join(source.root, oldPath, 'specification.yaml'), 'utf8');
  const parsed = parse(sourceManifest) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !('spec_id' in parsed) ||
    parsed.spec_id !== record.plan.specId ||
    !('id' in parsed) ||
    parsed.id !== record.plan.slug ||
    !('status' in parsed) ||
    typeof parsed.status !== 'string'
  )
    throw invalid('Canonical source manifest identity cannot be proved.');
  const archivedManifest = archivedManifestText(parsed);
  const archive: CloseArchiveEvidence = {
    sourceCommit: source.head,
    sourcePath: oldPath,
    destinationPath: newPath,
    files,
    archivedManifestSha256: digest(archivedManifest),
  };
  const initiated = await publish(engine, record, {
    ...record,
    stage: 'archive-initiated',
    archive,
  });
  // Test-only crash point; journal remains reserved and immutable after error.
  await afterArchiveIntent?.();
  // Filesystem move may tear; never re-run an uncertain move automatically.
  const archiveParent = join(source.root, 'specs', 'archive');
  if (await absent(archiveParent)) await mkdir(archiveParent);
  const parentStat = await lstat(archiveParent);
  if (
    !parentStat.isDirectory() ||
    parentStat.isSymbolicLink() ||
    (await realpath(archiveParent)) !== archiveParent
  )
    throw failure('Archive parent path is not a physical directory.');
  await renameWindowsSafe(join(source.root, oldPath), join(source.root, newPath), {
    directory: true,
  });
  // Test-only OS crash boundary at the durable atomic rename, before rewriting
  // the manifest. No automatic replay of an uncertain archive move.
  await afterArchiveMove?.();
  await writeFile(join(source.root, newPath, 'specification.yaml'), archivedManifest, 'utf8');
  await assertArchivedFiles(source.root, archive);
  await publish(engine, initiated, {
    ...initiated,
    stage: 'archive-commit-initiated',
  });

  try {
    const oldLiteral = ':(literal)' + oldPath;
    const newLiteral = ':(literal)' + newPath;
    // Recheck the exact checked-out branch and pinned pre-archive HEAD.
    // This is a TOCTOU guard, not an OS-wide lock on external Git writers.
    if (
      (await git(source.root, ['symbolic-ref', '--quiet', 'HEAD'])) !==
        'refs/heads/' + source.branch ||
      (await git(source.root, ['rev-parse', '--verify', 'HEAD'])) !== source.head
    ) {
      throw failure('Archive source branch changed before scoped Git commit.');
    }
    const add = await executeGitMutation(source.root, ['add', '-A', '--', oldLiteral, newLiteral]);
    if (add.exitCode !== 0) throw failure('Scoped archive staging failed; Git state is uncertain.');
    // Test-only OS crash boundary after real Git index mutation and before
    // verifying exact scoped stage contents. Claims remain retained on failure.
    await afterScopedStaging?.();
    const staged = (
      await gitRaw(source.root, ['diff', '--cached', '--name-only', '--no-renames', '-z'])
    )
      .split('\0')
      .filter(Boolean)
      .sort();
    const expected = [
      ...files.map((f) => f.relativePath),
      ...files.map((f) => destinationPath(archive, f.relativePath)),
    ].sort();
    if (!isDeepStrictEqual(staged, expected))
      throw failure('Unexpected staged path or incomplete archive change: commit refused.');
    // TODO(workspace-execution): enforce real external writer quiescence here
    // once Session/Attempt execution claims exist.
    const committed = await executeGitMutation(source.root, [
      '-c',
      'core.hooksPath=' + disabledHooksDirectory,
      '-c',
      'commit.gpgSign=false',
      '-c',
      'user.name=Nevo SpecFlow Engine',
      '-c',
      'user.email=engine@nevo.invalid',
      'commit',
      '--only',
      '-m',
      'archive(spec): ' + record.plan.slug + ' [operation:' + operationId + ']',
      '--',
      oldLiteral,
      newLiteral,
    ]);
    if (committed.exitCode !== 0) throw failure('Scoped archive commit outcome is uncertain.');
  } catch {
    throw failure(
      'Archive commit effect is uncertain; preserve journal and inspect Git before reconciliation.',
    );
  }
  // Test-only crash barrier AFTER the real scoped Git commit but BEFORE its
  // evidence is published to the Close journal.
  await afterArchiveCommit?.();
  return reconcileArchiveCommit(engine, operationId, true);
}

/** Never retry a Git commit. Only certify the resulting physical commit. */
export async function reconcileArchiveCommit(
  engine: SpecFlowEngine,
  operationId: string,
  confirmedNoActiveGitProcess: boolean,
): Promise<CloseJournal> {
  const record = await readCloseJournal(engine.context, operationId);
  if (record?.stage !== 'archive-commit-initiated' || !record.archive)
    throw failure('No pending archive commit intent to reconcile.');
  if (!confirmedNoActiveGitProcess)
    throw failure('Archive Git process quiescence has not been established.');
  const archive = record.archive,
    root = record.plan.source.root;
  const sha = await git(root, ['rev-parse', '--verify', 'HEAD']);
  const parent = await git(root, ['rev-list', '--parents', '-n', '1', sha]);
  if (parent !== sha + ' ' + archive.sourceCommit)
    throw failure('Archive commit must be exactly one descendant of pinned source.');
  const tree = await git(root, ['rev-parse', '--verify', 'HEAD^{tree}']);
  if ((await git(root, ['write-tree'])) !== tree)
    throw failure('Archive index does not match committed tree.');
  if (
    (await gitRaw(root, [
      '-c',
      'core.optionalLocks=false',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ])) !== ''
  )
    throw failure('Archive checkout contains staged, modified or untracked files.');
  await assertArchivedFiles(root, archive);
  const diffs = (
    await gitRaw(root, [
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '--no-renames',
      '-r',
      '-z',
      archive.sourceCommit,
      sha,
    ])
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const exact = [
    ...archive.files.map((f) => f.relativePath),
    ...archive.files.map((f) => destinationPath(archive, f.relativePath)),
  ].sort();
  if (!isDeepStrictEqual(diffs, exact))
    throw failure('Archive commit includes unrelated paths or omitted planned data.');
  return publish(engine, record, {
    ...record,
    stage: 'archive-committed',
    archive: { ...archive, committedHead: sha, committedTree: tree },
  });
}

/** Independent post-effect commit proof, shared by recovery inspection and CAS. */
async function proveArchiveCommitPhysical(
  root: string,
  archive: CloseArchiveEvidence,
  sha: string,
): Promise<string> {
  const parent = await git(root, ['rev-list', '--parents', '-n', '1', sha]);
  if (parent !== sha + ' ' + archive.sourceCommit)
    throw failure('Archive commit must be exactly one descendant of pinned source.');
  const tree = await git(root, ['rev-parse', '--verify', sha + '^{tree}']);
  if ((await git(root, ['write-tree'])) !== tree)
    throw failure('Archive index does not match committed tree.');
  if (
    (await gitRaw(root, [
      '-c',
      'core.optionalLocks=false',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ])) !== ''
  )
    throw failure('Archive checkout contains staged, modified or untracked files.');
  const diffs = (
    await gitRaw(root, [
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '--no-renames',
      '-r',
      '-z',
      archive.sourceCommit,
      sha,
    ])
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const exact = [
    ...archive.files.map((f) => f.relativePath),
    ...archive.files.map((f) => destinationPath(archive, f.relativePath)),
  ].sort();
  if (!isDeepStrictEqual(diffs, exact))
    throw failure('Archive commit includes unrelated paths or omitted planned data.');
  return tree;
}

/** Physical recovery evidence; never returns authority to retry uncertain Git. */
export type ArchivePhysicalRecovery =
  | 'not-started'
  | 'source-unmoved'
  | 'moved-original-manifest'
  | 'moved-archived-manifest'
  | 'commit-effect-uncertain'
  | 'committed-and-verified';

export async function inspectArchivePhysicalRecovery(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<ArchivePhysicalRecovery> {
  const record = await readCloseJournal(engine.context, operationId);
  if (!record) throw failure('Unknown archive operation.');
  const root = record.plan.source.root;
  const archive = record.archive;
  if (record.stage === 'reserved') {
    const location = 'specs/active/' + record.plan.slug;
    if (
      !(await absent(join(root, 'specs/archive/' + record.plan.slug))) ||
      (await absent(join(root, location)))
    )
      throw failure('Reserved archive checkout must contain only the original active source.');
    return 'not-started';
  }
  if (
    !archive ||
    ![
      'archive-initiated',
      'archive-commit-initiated',
      'archive-committed',
      'archived-linked-awaiting-integration',
      ...(record.stage === 'completed' && !record.integration ? ['completed'] : []),
    ].includes(record.stage)
  ) {
    throw failure('Archive physical recovery is unsupported at this lifecycle stage.');
  }
  const sourcePresent = !(await absent(join(root, archive.sourcePath)));
  const archivePresent = !(await absent(join(root, archive.destinationPath)));
  if (sourcePresent && archivePresent) {
    throw failure('Both active and archived source directories exist: do not overwrite.');
  }
  const branch = await git(root, ['symbolic-ref', '--quiet', 'HEAD']);
  if (branch !== 'refs/heads/' + record.plan.source.branch) {
    throw failure('Archive checkout switched branches during recovery.');
  }
  const currentHead = await git(root, ['rev-parse', '--verify', 'HEAD']);
  if (record.stage === 'archive-initiated') {
    if (currentHead !== archive.sourceCommit) {
      throw failure('Source HEAD moved before the archive commit intent.');
    }
    if (sourcePresent && !archivePresent) {
      const inventory = await physicalInventory(root, archive.sourcePath);
      if (!isDeepStrictEqual(inventory, archive.files))
        throw failure('Pre-move source differs from the pinned archive inventory.');
      return 'source-unmoved';
    }
    if (!sourcePresent && archivePresent) {
      const inventory = await physicalInventory(root, archive.destinationPath);
      const relocated = archive.files.map((file) => ({
        relativePath: destinationPath(archive, file.relativePath),
        sha256: file.sha256,
      }));
      if (isDeepStrictEqual(inventory, relocated)) return 'moved-original-manifest';
      await assertArchivedFiles(root, archive);
      return 'moved-archived-manifest';
    }
    throw failure('Neither canonical source nor archived destination can be proved.');
  }
  if (sourcePresent || !archivePresent) {
    throw failure('Archive commit intent requires exactly one archived destination.');
  }
  await assertArchivedFiles(root, archive);
  if (record.stage === 'archive-commit-initiated') {
    if (currentHead === archive.sourceCommit) return 'commit-effect-uncertain';
    // Git may have committed before the process died: prove effects without
    // promoting journal state or launching a second mutation.
    await proveArchiveCommitPhysical(root, archive, currentHead);
    return 'commit-effect-uncertain';
  }
  if (!archive.committedHead || currentHead !== archive.committedHead || !archive.committedTree) {
    throw failure('Journaled archive commit differs from the physical checkout.');
  }
  const tree = await proveArchiveCommitPhysical(root, archive, currentHead);
  if (tree !== archive.committedTree) {
    throw failure('Archived commit tree differs from durable journal proof.');
  }
  return 'committed-and-verified';
}

/** Read-only crash diagnosis, grounded in actual physical state. */
export async function inspectArchiveRecovery(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<'not-started' | 'move-incomplete' | 'commit-uncertain' | 'committed'> {
  const state = await inspectArchivePhysicalRecovery(engine, operationId);
  if (state === 'not-started') return 'not-started';
  if (
    state === 'source-unmoved' ||
    state === 'moved-original-manifest' ||
    state === 'moved-archived-manifest'
  )
    return 'move-incomplete';
  if (state === 'commit-effect-uncertain') return 'commit-uncertain';
  return 'committed';
}
