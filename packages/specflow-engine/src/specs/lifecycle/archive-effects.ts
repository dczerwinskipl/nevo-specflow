import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { parse, stringify } from 'yaml';

import type { SpecFlowEngine } from '../../application';
import { executeGitMutation } from '../../git/mutation';
import { executeGit } from '../../git/process';
import { publishCloseCheckpoint } from './close/checkpoint';
import { ARCHIVE_FILES_MAX, ARCHIVE_FILE_MAX_BYTES } from './limits';
import {
  inspectRegisteredWorkspace,
  readWorkspaceRegistry,
} from '../../project/workspace/registry/registry';
import { renameWindowsSafe } from '../../project/fs/windows-safe-fs';
import {
  inspectCleanGitWorkspace,
  listUncleanPaths,
  siblingSpecificationDirectories,
} from './preflight';
import { readableAttemptCommitHolds } from '../documents/attempt-commit-hold';
import { isExecutionStatePathOf } from '../execution-paths';
import { disabledIntegrationHooksDirectory } from './git/scratch';
import { readCloseJournal } from './journal/store';
import {
  CloseOperationError,
  type CloseJournal,
  type CloseArchiveEvidence,
  type CloseArchiveInventory,
  type CloseArchiveMove,
} from './model';
import { sha256Hex } from '../../hash';
import { SPECIFICATION_ROOT } from '../repository';

function failure(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_RECOVERY_REQUIRED', message);
}

function invalid(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_PREFLIGHT', message);
}

async function expectedFile(path: string): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw invalid('Archive source contains redirected/non-file data.');
  }

  if (stat.size > ARCHIVE_FILE_MAX_BYTES) {
    throw invalid('Archive source file exceeds bounded inventory size.');
  }

  return readFile(path);
}

async function physicalInventory(root: string, relative: string): Promise<CloseArchiveInventory[]> {
  const folder = join(root, relative);
  const stat = await lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(folder)) !== folder) {
    throw invalid('Archive directory is missing or redirected.');
  }

  const files: CloseArchiveInventory[] = [];
  async function visit(rel: string): Promise<void> {
    for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
      if (e.isSymbolicLink() || (!e.isDirectory() && !e.isFile())) {
        throw invalid('Archive inventory contains a symlink or special file.');
      }

      const path = rel + '/' + e.name;
      if (e.isDirectory()) {
        await visit(path);
      } else {
        if (files.length >= ARCHIVE_FILES_MAX) {
          throw invalid('Archive inventory file limit exceeded.');
        }

        files.push({ relativePath: path, sha256: sha256Hex(await expectedFile(join(root, path))) });
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
  if (result.exitCode !== 0) {
    throw failure('Cannot independently verify Git archive state.');
  }

  return result.stdout.trim();
}

async function gitRaw(root: string, args: readonly string[]): Promise<string> {
  const result = await executeGit(root, args);
  if (result.exitCode !== 0) {
    throw invalid('Archive Git tracking state is unavailable.');
  }

  return result.stdout;
}

/**
 * Every path `git status` reports (staged, modified, untracked) checkout-wide must be empty,
 * except another active Specification's own execution state (#181's sibling exemption — the same
 * predicate the admission-time clean-tree check already applies, never a blanket "anything outside
 * this Specification's own paths"). Fix 1: before this exemption, ANY staged or dirty file anywhere
 * in the checkout refused here, including a sibling's own pre-existing staged file that the A2
 * admission widening had already correctly tolerated, AFTER this Specification's own directory had
 * already been physically moved and committed. A genuinely alien/unexplained file — one that is not
 * a known sibling's own execution state — still refuses exactly as before.
 */
async function assertNoUnexpectedDirtyPaths(
  root: string,
  siblings: readonly { readonly directory: string }[],
): Promise<void> {
  const unclean = (await listUncleanPaths(root))
    .map((entry) => entry.path)
    .filter((path) => !siblings.some((sibling) => isExecutionStatePathOf(sibling.directory, path)));
  if (unclean.length > 0) {
    throw failure(
      "Archive checkout contains staged, modified or untracked files outside a known sibling Specification's own execution state.",
    );
  }
}

async function absent(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return false;
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'ENOENT') {
      return true;
    }

    throw e;
  }
}

function destinationPath(inventory: CloseArchiveMove, old: string): string {
  return inventory.destinationPath + old.slice(inventory.sourcePath.length);
}

/**
 * The paths the archive commit changes: every path of the source directory at the pinned commit
 * (removed) and every archived file (added). They are the source inventory moved, unless the
 * Specification's execution state was uncommitted: a new Task's files are only added, a removed
 * Task's only removed, a changed record is both.
 */
async function archiveCommitPaths(
  root: string,
  archive: CloseArchiveEvidence,
): Promise<readonly string[]> {
  const committed = (
    await gitRaw(root, [
      'ls-tree',
      '-r',
      '-z',
      '--name-only',
      archive.sourceCommit,
      '--',
      archive.sourcePath,
    ])
  )
    .split('\0')
    .filter(Boolean);

  return [
    ...new Set([
      ...committed,
      ...archive.files.map((file) => destinationPath(archive, file.relativePath)),
    ]),
  ].sort();
}

/**
 * The archived manifest: the parsed source with only `status` replaced, so `archetype`, `documents`,
 * `folders` and any unknown top-level key survive archival unchanged.
 */
export function archivedManifestText(parsed: object): string {
  return stringify({ ...parsed, status: 'archived' });
}

export async function assertArchivedFiles(root: string, archive: CloseArchiveMove): Promise<void> {
  if (!(await absent(join(root, archive.sourcePath)))) {
    throw failure('Active source still exists after archival.');
  }

  const expected = archive.files.map((file) => ({
    relativePath: destinationPath(archive, file.relativePath),
    // Only the manifest itself: `.execution/specification.yaml` (the Specification run) moves as is.
    sha256:
      file.relativePath === archive.sourcePath + '/specification.yaml'
        ? archive.archivedManifestSha256
        : file.sha256,
  }));
  const observed = await physicalInventory(root, archive.destinationPath);
  if (!isDeepStrictEqual(observed, expected)) {
    throw failure('Archived file inventory differs from durable intent.');
  }

  const manifest = parse(
    await readFile(join(root, archive.destinationPath, 'specification.yaml'), 'utf8'),
  ) as unknown;
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('status' in manifest) ||
    manifest.status !== 'archived'
  ) {
    throw failure('Archived manifest does not declare archived status.');
  }
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
      if (registry.revision !== old.plan.registryRevision) {
        throw failure('Registry revision changed during archival.');
      }
    },
  });
}

/**
 * The archive move of the active Specification `plan` names in the checkout at `root`, refused
 * before any effect: an existing destination, a missing or redirected source, a file that is not a
 * regular file, an obsolete `change.yaml`, a manifest of another Specification. Returns the move
 * and the archived manifest text it writes.
 */
export async function planArchiveMove(
  root: string,
  plan: { readonly specId: string; readonly slug: string },
): Promise<{ readonly move: CloseArchiveMove; readonly archivedManifest: string }> {
  const oldPath = 'specs/active/' + plan.slug;
  const newPath = 'specs/archive/' + plan.slug;
  if (!(await absent(join(root, newPath)))) {
    throw invalid('Archive destination already exists; never overwrite.');
  }

  const files = await physicalInventory(root, oldPath);
  if (!files.some((x) => x.relativePath === oldPath + '/specification.yaml')) {
    throw invalid('Canonical specification.yaml missing.');
  }

  if (files.some((x) => x.relativePath.endsWith('/change.yaml'))) {
    throw invalid('Obsolete change.yaml cannot be archived.');
  }

  const sourceManifest = await readFile(join(root, oldPath, 'specification.yaml'), 'utf8');
  const parsed = parse(sourceManifest) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !('spec_id' in parsed) ||
    parsed.spec_id !== plan.specId ||
    !('id' in parsed) ||
    parsed.id !== plan.slug ||
    !('status' in parsed) ||
    typeof parsed.status !== 'string'
  ) {
    throw invalid('Canonical source manifest identity cannot be proved.');
  }

  const archivedManifest = archivedManifestText(parsed);

  return {
    move: {
      sourcePath: oldPath,
      destinationPath: newPath,
      files,
      archivedManifestSha256: sha256Hex(archivedManifest),
    },
    archivedManifest,
  };
}

/**
 * The pinned archive move: one directory rename, then the archived manifest, then the proof that
 * the archive holds exactly the pinned files. The move may tear; it is never re-run automatically.
 */
export async function moveToArchive(
  root: string,
  move: CloseArchiveMove,
  archivedManifest: string,
  afterArchiveMove?: () => Promise<void>,
): Promise<void> {
  const archiveParent = join(root, SPECIFICATION_ROOT, 'archive');
  if (await absent(archiveParent)) {
    await mkdir(archiveParent);
  }

  const parentStat = await lstat(archiveParent);
  if (
    !parentStat.isDirectory() ||
    parentStat.isSymbolicLink() ||
    (await realpath(archiveParent)) !== archiveParent
  ) {
    throw failure('Archive parent path is not a physical directory.');
  }

  await renameWindowsSafe(join(root, move.sourcePath), join(root, move.destinationPath), {
    directory: true,
  });
  // Test-only OS crash boundary at the durable atomic rename, before rewriting
  // the manifest. No automatic replay of an uncertain archive move.
  await afterArchiveMove?.();
  await writeFile(join(root, move.destinationPath, 'specification.yaml'), archivedManifest, 'utf8');
  await assertArchivedFiles(root, move);
}

/** Where an interrupted archive move stopped, proved against its pinned inventory. */
export type ArchiveMoveState =
  'source-unmoved' | 'moved-original-manifest' | 'moved-archived-manifest';

/**
 * Read-only: the physical state of a pinned archive move. Exactly one of the active source and the
 * archive must exist and hold exactly the pinned files (with the original or the archived manifest);
 * anything else is `CLOSE_RECOVERY_REQUIRED`.
 */
export async function inspectArchiveMove(
  root: string,
  move: CloseArchiveMove,
): Promise<ArchiveMoveState> {
  const sourcePresent = !(await absent(join(root, move.sourcePath)));
  const archivePresent = !(await absent(join(root, move.destinationPath)));
  if (sourcePresent && !archivePresent) {
    const inventory = await physicalInventory(root, move.sourcePath);
    if (!isDeepStrictEqual(inventory, move.files)) {
      throw failure('Pre-move source differs from the pinned archive inventory.');
    }

    return 'source-unmoved';
  }

  if (!sourcePresent && archivePresent) {
    const inventory = await physicalInventory(root, move.destinationPath);
    const relocated = move.files.map((file) => ({
      relativePath: destinationPath(move, file.relativePath),
      sha256: file.sha256,
    }));
    if (isDeepStrictEqual(inventory, relocated)) {
      return 'moved-original-manifest';
    }

    await assertArchivedFiles(root, move);

    return 'moved-archived-manifest';
  }

  throw failure('Neither canonical source nor archived destination can be proved.');
}

/**
 * Finishes an interrupted pinned archive move from the state {@link inspectArchiveMove} proves:
 * the unmoved source is moved (after it is planned again and equals the pin), a moved archive with
 * the original manifest gets the pinned archived manifest. Only on the operator's confirmation that
 * nothing else writes the checkout; never automatically.
 */
export async function completeArchiveMove(
  root: string,
  move: CloseArchiveMove,
  plan: { readonly specId: string; readonly slug: string },
): Promise<void> {
  const state = await inspectArchiveMove(root, move);
  if (state === 'source-unmoved') {
    const planned = await planArchiveMove(root, plan);
    if (!isDeepStrictEqual(planned.move, move)) {
      throw failure('The source no longer plans the pinned archive move.');
    }

    await moveToArchive(root, move, planned.archivedManifest);

    return;
  }

  if (state === 'moved-original-manifest') {
    const manifestPath = join(root, move.destinationPath, 'specification.yaml');
    const archived = archivedManifestText(parse(await readFile(manifestPath, 'utf8')) as object);
    if (sha256Hex(archived) !== move.archivedManifestSha256) {
      throw failure('The moved manifest does not give the pinned archived manifest.');
    }

    await writeFile(manifestPath, archived, 'utf8');
    await assertArchivedFiles(root, move);
  }
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
  if (record?.plan.gitOff) {
    throw invalid('A Close with Git off archives without an archive commit.');
  }

  if (
    record?.stage !== 'reserved' ||
    record.plan.gitOff ||
    record.plan.kind !== 'specification-close' ||
    record.plan.location !== 'active'
  ) {
    throw invalid('Archive requires an unmodified reserved Specification Close.');
  }

  // Validate an Engine-owned, empty, non-symlinked hooksPath BEFORE moving
  // archive files. Never point internal commits at a potentially executable
  // repository hook, including after an untrusted filesystem replacement.
  const disabledHooksDirectory = await disabledIntegrationHooksDirectory(engine);
  const source = record.plan.source;
  const registry = await engine.readRegistry();
  if (registry.revision !== record.plan.registryRevision) {
    throw invalid('Registry changed after reservation.');
  }

  const actual = await inspectRegisteredWorkspace(engine.context, registry, source.workspaceId);
  if (actual.status !== 'available' || actual.root !== source.root) {
    throw invalid('Canonical source checkout unavailable.');
  }

  const oldPath = 'specs/active/' + record.plan.slug;
  const newPath = 'specs/archive/' + record.plan.slug;
  // The Specification's uncommitted execution state goes into the archive commit; a sibling
  // Specification's own pending execution state does not block it either (#181); nothing else may
  // be dirty, and never a path a waiting agent attempt commit takes (D15).
  const siblings = await siblingSpecificationDirectories(
    actual.root,
    source.workspaceId,
    registry,
    record.plan.specId,
  );
  const facts = await inspectCleanGitWorkspace(actual.workspace, {
    specificationDirectory: oldPath,
    acceptExecutionState: true,
    siblingDirectories: siblings.map((entry) => entry.directory),
    holds: await readableAttemptCommitHolds(engine, source.workspaceId),
  });
  if (
    facts.head !== source.head ||
    facts.branch !== source.branch ||
    facts.instanceId !== source.instanceId
  ) {
    throw invalid('Source Git commit or physical incarnation changed.');
  }

  const { move, archivedManifest } = await planArchiveMove(source.root, record.plan);
  const files = move.files;

  // Explicitly disallow ignored/untracked files: every physical file must be
  // indexed in Git at the pinned commit, including ancillary directories. The
  // only exception is the Specification's execution state, which may be
  // untracked (a new Task) or removed (a removed Task) and is committed here.
  const tracked = new Set(
    (await gitRaw(source.root, ['ls-files', '-z', '--', oldPath])).split('\0').filter(Boolean),
  );
  const untracked = new Set(
    (await listUncleanPaths(source.root))
      .filter((entry) => entry.status === '??')
      .map((entry) => entry.path),
  );
  const physical = new Set(files.map((file) => file.relativePath));
  const execution = (path: string): boolean => isExecutionStatePathOf(oldPath, path);
  if (
    [...physical].some((path) => !tracked.has(path) && !(untracked.has(path) && execution(path))) ||
    [...tracked].some((path) => !physical.has(path) && !execution(path))
  ) {
    throw invalid('Archive directory contains ignored or non-versioned data.');
  }

  const archive: CloseArchiveEvidence = { sourceCommit: source.head, ...move };
  const initiated = await publish(engine, record, {
    ...record,
    stage: 'archive-initiated',
    archive,
  });
  // Test-only crash point; journal remains reserved and immutable after error.
  await afterArchiveIntent?.();
  await moveToArchive(source.root, archive, archivedManifest, afterArchiveMove);
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
    if (add.exitCode !== 0) {
      throw failure('Scoped archive staging failed; Git state is uncertain.');
    }

    // Test-only OS crash boundary after real Git index mutation and before
    // verifying exact scoped stage contents. Claims remain retained on failure.
    await afterScopedStaging?.();
    // Scoped to this Specification's own pathspecs, exactly like the staging and commit calls above
    // (Fix 1): a sibling Specification's own pre-existing staged file must not appear here.
    const staged = (
      await gitRaw(source.root, [
        'diff',
        '--cached',
        '--name-only',
        '--no-renames',
        '-z',
        '--',
        oldLiteral,
        newLiteral,
      ])
    )
      .split('\0')
      .filter(Boolean)
      .sort();
    const expected = await archiveCommitPaths(source.root, archive);
    if (!isDeepStrictEqual(staged, expected)) {
      throw failure('Unexpected staged path or incomplete archive change: commit refused.');
    }

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
    if (committed.exitCode !== 0) {
      throw failure('Scoped archive commit outcome is uncertain.');
    }
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
  if (record?.stage !== 'archive-commit-initiated' || !record.archive) {
    throw failure('No pending archive commit intent to reconcile.');
  }

  if (!confirmedNoActiveGitProcess) {
    throw failure('Archive Git process quiescence has not been established.');
  }

  const archive = record.archive,
    root = record.plan.source.root;
  const sha = await git(root, ['rev-parse', '--verify', 'HEAD']);
  const parent = await git(root, ['rev-list', '--parents', '-n', '1', sha]);
  if (parent !== sha + ' ' + archive.sourceCommit) {
    throw failure('Archive commit must be exactly one descendant of pinned source.');
  }

  const tree = await git(root, ['rev-parse', '--verify', 'HEAD^{tree}']);
  // #181 sibling exemption, not a blanket scope to this Specification's own paths (Fix 1): a
  // sibling's own pre-existing dirty or staged file must not refuse this Close after its directory
  // already moved, but a genuinely alien file elsewhere still must.
  const registry = await readWorkspaceRegistry(engine.context);
  const siblings = await siblingSpecificationDirectories(
    root,
    record.plan.source.workspaceId,
    registry,
    record.plan.specId,
  );
  await assertNoUnexpectedDirtyPaths(root, siblings);

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
  const exact = await archiveCommitPaths(root, archive);
  if (!isDeepStrictEqual(diffs, exact)) {
    throw failure('Archive commit includes unrelated paths or omitted planned data.');
  }

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
  siblings: readonly { readonly directory: string }[],
): Promise<string> {
  const parent = await git(root, ['rev-list', '--parents', '-n', '1', sha]);
  if (parent !== sha + ' ' + archive.sourceCommit) {
    throw failure('Archive commit must be exactly one descendant of pinned source.');
  }

  const tree = await git(root, ['rev-parse', '--verify', sha + '^{tree}']);
  // #181 sibling exemption, not a blanket scope to this Specification's own paths: see
  // `assertNoUnexpectedDirtyPaths`.
  await assertNoUnexpectedDirtyPaths(root, siblings);

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
  const exact = await archiveCommitPaths(root, archive);
  if (!isDeepStrictEqual(diffs, exact)) {
    throw failure('Archive commit includes unrelated paths or omitted planned data.');
  }

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
  if (!record) {
    throw failure('Unknown archive operation.');
  }

  if (record.plan.gitOff) {
    throw failure('An archive without Git has no archive commit to inspect.');
  }

  const root = record.plan.source.root;
  const archive = record.archive;
  if (record.stage === 'reserved') {
    const location = 'specs/active/' + record.plan.slug;
    if (
      !(await absent(join(root, 'specs/archive/' + record.plan.slug))) ||
      (await absent(join(root, location)))
    ) {
      throw failure('Reserved archive checkout must contain only the original active source.');
    }

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

    return inspectArchiveMove(root, archive);
  }

  if (sourcePresent || !archivePresent) {
    throw failure('Archive commit intent requires exactly one archived destination.');
  }

  await assertArchivedFiles(root, archive);
  const registry = await readWorkspaceRegistry(engine.context);
  const siblings = await siblingSpecificationDirectories(
    root,
    record.plan.source.workspaceId,
    registry,
    record.plan.specId,
  );
  if (record.stage === 'archive-commit-initiated') {
    if (currentHead === archive.sourceCommit) {
      return 'commit-effect-uncertain';
    }

    // Git may have committed before the process died: prove effects without
    // promoting journal state or launching a second mutation.
    await proveArchiveCommitPhysical(root, archive, currentHead, siblings);

    return 'commit-effect-uncertain';
  }

  if (!archive.committedHead || currentHead !== archive.committedHead || !archive.committedTree) {
    throw failure('Journaled archive commit differs from the physical checkout.');
  }

  const tree = await proveArchiveCommitPhysical(root, archive, currentHead, siblings);
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
  if (state === 'not-started') {
    return 'not-started';
  }

  if (
    state === 'source-unmoved' ||
    state === 'moved-original-manifest' ||
    state === 'moved-archived-manifest'
  ) {
    return 'move-incomplete';
  }

  if (state === 'commit-effect-uncertain') {
    return 'commit-uncertain';
  }

  return 'committed';
}
