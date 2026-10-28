import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { GitCapabilityError } from '../../git/errors';
import { executeGitMutation, MUTATION_TERMINATED } from '../../git/mutation';
import { executeGit, type GitCommandResult, type GitReadOptions } from '../../git/process';
import { disabledIntegrationHooksDirectory } from '../../specs/lifecycle/git/scratch-directories';
import { readProjectGitPolicy } from '../worktrees/config';
import { engineCommitRefusal } from './branch-patterns';
import {
  classifyDocumentPath,
  idsOfTrailerValue,
  isNonBlobState,
  splitEffectivePaths,
  type DocumentPathExpectation,
  type DocumentPathFacts,
  type DocumentPathInspection,
} from './document-change';
import { blocked, failed, inspectionFailed } from './commit-errors';
import { COMMIT_SUBJECT_MAX, commitBodyForGit, commitSubjectForGit } from './commit-message';
import { prepareDocumentIndex } from './document-index';
import { chunkPaths, PathFactsError, readPathFacts, type GitReader } from './path-facts';
import {
  DOCUMENT_COMMIT_DEADLINE_MS,
  type CommitPort,
  type EffectivePaths,
  type EngineCommitResult,
  type EngineCommitRequest,
  type FoundCommit,
  type PathsState,
} from './port';

const ENGINE_NAME = 'Nevo SpecFlow Engine';
const ENGINE_EMAIL = 'engine@nevo.invalid';
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
const TRAILER_KEY = /^Nevo-[A-Za-z]+$/u;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]+/gu;
/** Git state files whose presence means another Git operation owns the checkout. */
const BUSY_STATE = [
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'REBASE_HEAD',
  'rebase-merge',
  'rebase-apply',
  'sequencer',
] as const;
/**
 * The Engine commits the pinned working-tree bytes whatever the user's `core.autocrlf` is:
 * conversion and its round-trip check (`core.safecrlf`) are disabled for every command that reads the
 * scaffold working-tree bytes into the index or compares them with the commit. `.gitattributes`
 * still apply, as they do for a hand commit: the blob is what Git's attributes store for the pinned
 * bytes (see ADR 0013).
 */
const EXACT_BYTES = ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false'] as const;
const LOCK_RETRIES = 3;
const LOCK_RETRY_MS = 200;
/** A Git step that has less of the attempt's budget left than this does not start (retryable). */
export const MIN_STEP_BUDGET_MS = 1000;
/** Once a mutation started, the reads that tell what it did keep at least this long. */
const EVIDENCE_READ_MS = 5000;
const READ_TIMEOUT_MS = 10_000;
/**
 * Paths of document mutations travel in a file (`--pathspec-from-file`, Git 2.25 or newer), never
 * as arguments: a batch holds 200 paths and the command line is capped (about 32K on Windows).
 * `--literal-pathspecs` keeps every entry a plain path.
 */
const LITERAL_PATHSPECS = '--literal-pathspecs';

/** Test seams of the Git commit port. */
export interface CommitPortSeams {
  /** Runs inside the window between the checks and `git commit`. */
  readonly afterPreflight?: () => Promise<void>;
  readonly afterRecheck?: () => Promise<void>;
  /** The read-only Git runner (`executeGit`); a spawn probe or a failure injector. */
  readonly read?: (
    root: string,
    args: readonly string[],
    options?: GitReadOptions,
  ) => Promise<GitCommandResult>;
  /** The mutating Git runner (`executeGitMutation`). */
  readonly mutate?: typeof executeGitMutation;
  /** Whether the checkout compares paths case-insensitively (`core.ignorecase`). */
  readonly ignoreCase?: (root: string, run: GitReader) => Promise<boolean>;
}

async function readIgnoreCase(root: string, run: GitReader): Promise<boolean> {
  const result = await run(root, ['config', '--bool', '--get', 'core.ignorecase']);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

/** Internal Engine composition; the mutating commit never leaves the Engine package. */
export function createGitCommitPort(
  engine: SpecFlowEngine,
  testHooks?: CommitPortSeams,
): CommitPort {
  const baseRead = testHooks?.read ?? executeGit;
  const runMutation = testHooks?.mutate ?? executeGitMutation;
  const plainRead: GitReader = (root, args) => baseRead(root, args);

  /** The read-only operations over one Git reader (a commit attempt reads within its budget). */
  const operations = (run: GitReader) => {
    const head = async (root: string): Promise<string | undefined> => {
      const result = await run(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
      const sha = result.stdout.trim();
      return result.exitCode === 0 && OBJECT_ID.test(sha) ? sha : undefined;
    };

    /** HEAD is attached to exactly the expected branch and the committed policy allows committing there. */
    const assertAttachedToExpected = async (request: EngineCommitRequest): Promise<void> => {
      const attached = await run(request.root, ['symbolic-ref', '--quiet', 'HEAD']);
      if (attached.exitCode !== 0) throw blocked('detached');
      if (attached.stdout.trim() !== 'refs/heads/' + request.expectedBranch) {
        throw blocked('branch-changed');
      }

      // Always the committed Project Home policy, read fresh: a branch protected after reservation
      // blocks, and a linked checkout cannot loosen its own protection.
      const { policy } = await readProjectGitPolicy(engine.context);
      const refusal = engineCommitRefusal(policy.commits, request.expectedBranch);
      if (refusal) {
        throw new GitCapabilityError(
          'BRANCH_PROTECTED',
          'The Engine does not commit on this branch.',
          refusal,
        );
      }
    };

    const preflight = async (request: EngineCommitRequest): Promise<void> => {
      validateRequest(request);
      const { root } = request;
      await assertAttachedToExpected(request);

      const gitPaths = await resolveGitPaths(root, [...BUSY_STATE, 'index.lock'], run);
      for (const name of BUSY_STATE) {
        if (await exists(gitPaths.get(name)!)) throw blocked('git-busy');
      }
      const unmerged = await run(root, ['ls-files', '--unmerged', '-z']);
      if (unmerged.exitCode !== 0) throw blocked('index-unreadable');
      if (unmerged.stdout.length > 0) throw blocked('unmerged-paths');
      if (!(await head(root))) throw blocked('no-commits');

      // One process per chunk of paths; it lists the ignored ones (exit 0) or nothing (exit 1).
      for (const chunk of chunkPaths(request.paths)) {
        const ignored = await run(root, ['check-ignore', '--no-index', '--', ...chunk]);
        if (ignored.exitCode === 0 && ignored.stdout.trim().length > 0)
          throw blocked('path-ignored');
        if (ignored.exitCode !== 0 && ignored.exitCode !== 1) throw blocked('ignore-check-failed');
      }
      if (!(await indexUnlocked(gitPaths.get('index.lock')!))) throw blocked('index-locked');
    };

    const findByOperation = async (
      root: string,
      operationId: string,
      sinceHead: string,
    ): Promise<FoundCommit> => {
      if (!OPERATION_ID.test(operationId) || !OBJECT_ID.test(sinceHead)) {
        throw new GitCapabilityError('COMMIT_BLOCKED', 'Invalid commit search request.', 'invalid');
      }
      const ancestor = await run(root, ['merge-base', '--is-ancestor', sinceHead, 'HEAD']);
      if (ancestor.exitCode === 1) return { status: 'history-changed' };
      if (ancestor.exitCode !== 0) throw inspectionFailed('merge-base');
      // The operation is read from the REAL trailer block (`%(trailers)` parses only the last
      // paragraph, like `git interpret-trailers`) and only on a commit the Engine itself committed
      // (Engine committer identity). A title or body line that looks like a trailer, or a user commit
      // that quotes one, can therefore never claim an operation.
      const log = await run(root, [
        'log',
        '--format=%x1e%H%x1f%ce%x1f%(trailers:key=Nevo-Operation,valueonly=true,unfold=true,separator=%x1d)%x1f%(trailers:key=Nevo-Coalesced,valueonly=true,unfold=true,separator=%x1d)',
        sinceHead + '..HEAD',
      ]);
      if (log.exitCode !== 0) throw inspectionFailed('log');
      const shas = log.stdout
        .split('\x1e')
        .map((record) => record.split('\x1f'))
        .filter(
          ([, committer, trailers, coalesced]) =>
            committer?.trim() === ENGINE_EMAIL &&
            ((trailers ?? '')
              .split('\x1d')
              .some((value) => value.trim().toLowerCase() === operationId.toLowerCase()) ||
              // A document batch names the operations it consolidated in `Nevo-Coalesced`.
              (coalesced ?? '')
                .split('\x1d')
                .flatMap(idsOfTrailerValue)
                .some((value) => value.toLowerCase() === operationId.toLowerCase())),
        )
        .map(([sha]) => sha!.trim());
      if (shas.length === 0) return { status: 'absent' };
      if (shas.length > 1) {
        throw new GitCapabilityError(
          'GIT_OPERATION_UNCERTAIN',
          'More than one commit claims this operation.',
          'duplicate-operation-commit',
        );
      }
      const sha = shas[0]!;
      const changed = await run(root, [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '--no-renames',
        '-r',
        '-z',
        '--root',
        sha,
      ]);
      if (changed.exitCode !== 0) throw inspectionFailed('diff-tree');
      return { status: 'found', sha, paths: changed.stdout.split('\0').filter(Boolean).sort() };
    };

    const currentBranch = async (root: string): Promise<string> => {
      const attached = await run(root, ['symbolic-ref', '--quiet', 'HEAD']);
      const ref = attached.stdout.trim();
      if (attached.exitCode !== 0 || !ref.startsWith('refs/heads/')) throw blocked('detached');
      return ref.slice('refs/heads/'.length);
    };

    const inspectPaths = async (root: string, paths: readonly string[]): Promise<PathsState> => {
      const literals = paths.map((path) => ':(literal)' + path);
      const tree = await run(root, [
        'ls-tree',
        '-r',
        '--name-only',
        '-z',
        'HEAD',
        '--',
        ...literals,
      ]);
      if (tree.exitCode !== 0) throw inspectionFailed('ls-tree');
      const tracked = tree.stdout.split('\0').filter(Boolean);
      if (tracked.length === 0) return { state: 'uncommitted' };
      if (!sameSet(tracked, paths)) return { state: 'mixed' };
      const status = await run(root, [
        ...EXACT_BYTES,
        '-c',
        'core.optionalLocks=false',
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--',
        ...literals,
      ]);
      if (status.exitCode !== 0) throw inspectionFailed('status');
      if (status.stdout.length > 0) return { state: 'mixed' };
      const last = await run(root, ['log', '-1', '--format=%H', 'HEAD', '--', ...literals]);
      const sha = last.stdout.trim();
      if (last.exitCode !== 0 || !OBJECT_ID.test(sha)) throw inspectionFailed('log');
      return { state: 'committed', sha };
    };

    const blobMatchesWorkingFile = async (
      root: string,
      commitSha: string,
      path: string,
    ): Promise<boolean> => {
      if (!OBJECT_ID.test(commitSha)) throw inspectionFailed('object-id');
      // `hash-object <file>` runs the file through the clean filters of its path (attributes), exactly
      // like `git add`; `--no-filters` would hide an eol rule.
      const stored = await run(root, [...EXACT_BYTES, 'hash-object', '--', path]);
      const committed = await run(root, [
        'rev-parse',
        '--verify',
        '--quiet',
        commitSha + ':' + path,
      ]);
      if (stored.exitCode !== 0 || committed.exitCode !== 0) return false;
      return stored.stdout.trim() === committed.stdout.trim();
    };

    const isAncestor = async (
      root: string,
      ancestor: string,
      descendant: string,
    ): Promise<boolean> => {
      if (!OBJECT_ID.test(ancestor) || !OBJECT_ID.test(descendant))
        throw inspectionFailed('object-id');
      const result = await run(root, ['merge-base', '--is-ancestor', ancestor, descendant]);
      if (result.exitCode === 0) return true;
      if (result.exitCode === 1) return false;
      throw inspectionFailed('merge-base');
    };

    const factsDeps = { run, exactBytes: EXACT_BYTES };
    const pathFacts = async (
      root: string,
      paths: readonly string[],
      at = 'HEAD',
    ): Promise<DocumentPathFacts[]> => {
      if (at !== 'HEAD' && !OBJECT_ID.test(at)) throw inspectionFailed('object-id');
      try {
        return await readPathFacts(factsDeps, root, paths, at);
      } catch (error) {
        if (error instanceof PathFactsError) throw inspectionFailed(error.reason);
        throw error;
      }
    };

    const effectivePaths = async (
      root: string,
      paths: readonly string[],
    ): Promise<EffectivePaths> => {
      const facts = await pathFacts(root, paths);
      return { ...splitEffectivePaths(facts), facts };
    };

    const inspectDocumentPaths = async (
      root: string,
      expectations: readonly DocumentPathExpectation[],
      at = 'HEAD',
    ): Promise<DocumentPathInspection[]> => {
      const facts = await pathFacts(
        root,
        expectations.map((expectation) => expectation.path),
        at,
      );
      return facts.map((fact, index) => ({
        ...fact,
        state: classifyDocumentPath(fact, expectations[index]!),
      }));
    };

    /** Index entries (path -> blob id) of the given literal paths. */
    const indexEntries = async (
      root: string,
      paths: readonly string[],
    ): Promise<Map<string, string>> => {
      const entries = new Map<string, string>();
      for (const chunk of chunkPaths(paths)) {
        const staged = await run(root, [
          'ls-files',
          '--stage',
          '-z',
          '--',
          ...chunk.map((path) => ':(literal)' + path),
        ]);
        if (staged.exitCode !== 0) throw inspectionFailed('ls-files');
        for (const record of staged.stdout.split('\0').filter(Boolean)) {
          const tab = record.indexOf('\t');
          const [, id, stage] = record.slice(0, tab).split(' ');
          if (id !== undefined && stage === '0') entries.set(record.slice(tab + 1), id);
        }
      }
      return entries;
    };

    return {
      run,
      head,
      assertAttachedToExpected,
      preflight,
      findByOperation,
      currentBranch,
      inspectPaths,
      blobMatchesWorkingFile,
      isAncestor,
      pathFacts,
      effectivePaths,
      inspectDocumentPaths,
      indexEntries,
    };
  };
  const ops = operations(plainRead);

  type Mutate = (
    args: readonly string[],
  ) => Promise<{ readonly exitCode: number; readonly stderr: string }>;

  const commitSerialized = async (request: EngineCommitRequest): Promise<EngineCommitResult> => {
    const { root } = request;
    const isDocument = request.kind === 'document-change' || request.kind === 'manual-commit';

    // A document attempt has one budget: every Git step, read or mutation, gets what is left of it,
    // and a step with less than `MIN_STEP_BUDGET_MS` left does not start (the retryable
    // `deadline-exceeded`). Once a mutation started the reads that tell what it did keep a floor, so
    // the evidence is never refused. Other kinds keep the per-process defaults.
    const deadline = Date.now() + (request.deadlineMs ?? DOCUMENT_COMMIT_DEADLINE_MS);
    let enforcing = true;
    const budgeted: GitReader = async (cwd, args) => {
      const remaining = deadline - Date.now();
      if (enforcing && remaining < MIN_STEP_BUDGET_MS) throw blocked('deadline-exceeded');
      const bounded = Math.min(remaining, READ_TIMEOUT_MS);
      return baseRead(cwd, args, {
        timeoutMs: enforcing ? bounded : Math.max(bounded, EVIDENCE_READ_MS),
      });
    };
    const reads = isDocument ? operations(budgeted) : ops;

    await reads.preflight(request);
    const parentHead = await reads.head(root);
    if (!parentHead) throw blocked('no-commits');
    const hooks = await disabledIntegrationHooksDirectory(engine);
    const literals = request.paths.map((path) => ':(literal)' + path);

    const mutate: Mutate = (args) =>
      withLockRetry(() => {
        if (!isDocument) return runMutation(root, args);
        const remaining = deadline - Date.now();
        if (remaining < MIN_STEP_BUDGET_MS) throw blocked('deadline-exceeded');
        enforcing = false;
        return runMutation(root, args, { timeoutMs: remaining });
      });
    /** A mutation naming paths: they go in a pathspec file and stay plain paths. */
    const mutatePaths = (args: readonly string[], paths: readonly string[]) =>
      withPathspecFile(paths, (fileArguments) =>
        mutate([LITERAL_PATHSPECS, ...args, ...fileArguments]),
      );

    let engineAdded: readonly string[] = [];
    let interrupted = false;
    // The mutation was interrupted but git is provably gone: the checkout tells whether anything happened.
    const nothingHappened = async (): Promise<boolean> => {
      if (!isDocument) return false;
      const found = await reads.findByOperation(root, request.operationId, parentHead);
      if (found.status !== 'absent') return false;
      const gitPaths = await resolveGitPaths(root, ['index.lock'], reads.run);
      return (
        (await reads.head(root)) === parentHead && !(await exists(gitPaths.get('index.lock')!))
      );
    };
    const isTerminatedInterruption = (error: unknown): boolean =>
      isDocument &&
      error instanceof GitCapabilityError &&
      error.code === 'GIT_OPERATION_UNCERTAIN' &&
      error.reason === MUTATION_TERMINATED;
    const isDeadlineExceeded = (error: unknown): boolean =>
      isDocument &&
      error instanceof GitCapabilityError &&
      error.code === 'COMMIT_BLOCKED' &&
      error.reason === 'deadline-exceeded';
    const takeBack = (): Promise<void> =>
      isDocument
        ? resetPaths(root, engineAdded, runMutation)
        : dropIntentToAdd(root, request.paths, reads.run);

    if (isDocument) {
      const batch = [...request.paths, ...(request.droppedPaths ?? [])];
      const facts = await reads.pathFacts(root, batch);
      // A directory where a document is expected (in HEAD or on disk), or the reverse, is not a
      // document change Git can commit; nothing was touched yet.
      if (
        facts.some(
          (fact) =>
            request.paths.includes(fact.path) &&
            (isNonBlobState(fact.head) || isNonBlobState(fact.working)),
        )
      ) {
        throw blocked('path-kind-conflict');
      }
      // The effective set is decided at execution: a path that now equals HEAD cannot be committed.
      if (facts.some((fact) => request.paths.includes(fact.path) && fact.working === fact.head)) {
        throw blocked('effective-set-changed');
      }
      try {
        await prepareDocumentIndex(facts, {
          indexEntries: (paths) => reads.indexEntries(root, paths),
          ignoreCase: () => (testHooks?.ignoreCase ?? readIgnoreCase)(root, reads.run),
          mutatePaths,
          takeBack: (paths) => resetPaths(root, paths, runMutation),
          // Ownership is recorded before the add: an add that gets killed may have added some paths.
          owned: (paths) => {
            engineAdded = paths;
          },
          addArgs: [...EXACT_BYTES, 'add', '--intent-to-add'],
        });
      } catch (error) {
        if (isDeadlineExceeded(error)) {
          await takeBack();
          throw error;
        }
        if (!isTerminatedInterruption(error) || !(await nothingHappened())) throw error;
        await takeBack();
        throw blocked('commit-timed-out');
      }
    } else {
      // Makes untracked scaffold files "known" to Git (so `--only` accepts them) without staging
      // their content; nothing else in the index is touched.
      const added = await mutate([...EXACT_BYTES, 'add', '--intent-to-add', '--', ...literals]);
      if (added.exitCode !== 0) throw failed('intent-to-add');
    }

    const author = await userAuthor(root, reads.run);
    // `git commit` commits on whatever HEAD is at that moment: confirm the branch (and its
    // protection) once more immediately before it, and verify where the commit landed after.
    try {
      await testHooks?.afterPreflight?.();
      await reads.assertAttachedToExpected(request);
      await testHooks?.afterRecheck?.();
    } catch (error) {
      if (isDocument) await takeBack();
      throw error;
    }
    let committed: { readonly exitCode: number; readonly stderr: string };
    try {
      const commitArguments = [
        ...EXACT_BYTES,
        '-c',
        'core.hooksPath=' + hooks,
        '-c',
        'commit.gpgSign=false',
        '-c',
        'user.name=' + ENGINE_NAME,
        '-c',
        'user.email=' + ENGINE_EMAIL,
        'commit',
        '--only',
        '--no-verify',
        '--no-gpg-sign',
        ...(author ? ['--author=' + author] : []),
        ...messageArguments(request),
      ];
      committed = isDocument
        ? await mutatePaths(commitArguments, request.paths)
        : await mutate([...commitArguments, '--', ...literals]);
    } catch (error) {
      if (!isTerminatedInterruption(error)) {
        // The budget ran out before the commit started: nothing happened, take the entries back.
        if (isDeadlineExceeded(error)) await takeBack();
        throw error;
      }
      interrupted = true;
      committed = { exitCode: -1, stderr: '' };
    }
    // A non-zero exit does not prove "nothing happened": look for our commit by its trailer.
    const found = await reads.findByOperation(root, request.operationId, parentHead);
    if (found.status === 'found') {
      if (!sameSet(found.paths, request.paths)) {
        throw new GitCapabilityError(
          'GIT_OPERATION_UNCERTAIN',
          'The Engine commit does not contain exactly the expected paths.',
          'unexpected-commit-content',
        );
      }
      const landed = await reads.run(root, [
        'merge-base',
        '--is-ancestor',
        found.sha,
        'refs/heads/' + request.expectedBranch,
      ]);
      if (landed.exitCode !== 0) {
        throw new GitCapabilityError(
          'GIT_OPERATION_UNCERTAIN',
          'The Engine commit did not land on the expected branch.',
          'commit-on-unexpected-branch',
        );
      }
      return { sha: found.sha, parentHead };
    }
    if (found.status === 'history-changed') {
      throw new GitCapabilityError(
        'GIT_OPERATION_UNCERTAIN',
        'Git history changed during the Engine commit.',
        'history-changed',
      );
    }
    if (interrupted) {
      // Decisive evidence (no trailer commit, HEAD still the parent, no index lock) makes a hung or
      // killed commit an ordinary retryable failure; anything else needs a human.
      if (await nothingHappened()) {
        await takeBack();
        throw blocked('commit-timed-out');
      }
      throw new GitCapabilityError(
        'GIT_OPERATION_UNCERTAIN',
        'The Engine commit was interrupted and its effect is not provable.',
        'commit-interrupted',
      );
    }
    await takeBack();
    if (committed.exitCode !== 0) throw failed('commit-exit-' + String(committed.exitCode));
    throw new GitCapabilityError(
      'GIT_OPERATION_UNCERTAIN',
      'The Engine commit reported success but cannot be found.',
      'commit-not-found',
    );
  };

  return {
    preflight: ops.preflight,
    findByOperation: ops.findByOperation,
    head: ops.head,
    currentBranch: ops.currentBranch,
    inspectPaths: ops.inspectPaths,
    blobMatchesWorkingFile: ops.blobMatchesWorkingFile,
    isAncestor: ops.isAncestor,
    effectivePaths: ops.effectivePaths,
    pathFacts: ops.pathFacts,
    inspectDocumentPaths: ops.inspectDocumentPaths,
    // Commits in one checkout run one at a time inside this process (they all move the same HEAD);
    // another process is covered by the lost-race retries below.
    commit: (request) => serializePerCheckout(request.root, () => commitSerialized(request)),
  };
}

/** Takes back index entries the Engine added (never touches a path HEAD tracks). */
async function resetPaths(
  root: string,
  paths: readonly string[],
  runMutation: typeof executeGitMutation,
): Promise<void> {
  if (paths.length === 0) return;
  await withPathspecFile(paths, (fileArguments) =>
    runMutation(root, [LITERAL_PATHSPECS, 'reset', '-q', ...fileArguments]),
  ).catch(() => undefined);
}

/**
 * Runs `run` with the arguments that make Git read `paths` from a file (NUL separated, plain
 * paths because of `--literal-pathspecs`) and removes the file afterwards.
 */
async function withPathspecFile<T>(
  paths: readonly string[],
  run: (fileArguments: readonly string[]) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'nevo-paths-'));
  try {
    const file = join(directory, 'paths');
    await writeFile(file, paths.map((path) => path + '\0').join(''));
    return await run(['--pathspec-from-file=' + file, '--pathspec-file-nul']);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * A commit that provably did not happen must not leave the scaffold files as intent-to-add entries in
 * the user's index. Only paths that HEAD does not track are touched (the user's staged work on a
 * tracked path is never reset). Best effort: a retry works whether or not the cleanup succeeded.
 * Precondition (ADR 0013): the paths are new files this operation wrote, so no user staging of them
 * can exist for the reset to drop.
 */
async function dropIntentToAdd(
  root: string,
  paths: readonly string[],
  run: GitReader,
): Promise<void> {
  const literals = paths.map((path) => ':(literal)' + path);
  const tracked = await run(root, [
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    'HEAD',
    '--',
    ...literals,
  ]);
  if (tracked.exitCode !== 0) return;
  const known = new Set(tracked.stdout.split('\0').filter(Boolean));
  const untracked = paths.filter((path) => !known.has(path)).map((path) => ':(literal)' + path);
  if (untracked.length === 0) return;
  await executeGitMutation(root, ['reset', '-q', '--', ...untracked]).catch(() => undefined);
}

function validateRequest(request: EngineCommitRequest): void {
  if (
    !OPERATION_ID.test(request.operationId) ||
    request.paths.length === 0 ||
    request.paths.some(
      (path) =>
        path.length === 0 ||
        isAbsolute(path) ||
        path.includes('\0') ||
        path.includes('\\') ||
        path.split('/').some((part) => part === '' || part === '.' || part === '..'),
    ) ||
    Object.keys(request.trailers ?? {}).some((key) => !TRAILER_KEY.test(key))
  ) {
    throw new GitCapabilityError('COMMIT_BLOCKED', 'Invalid Engine commit request.', 'invalid');
  }
}

function messageArguments(request: EngineCommitRequest): string[] {
  const line = (value: string, max: number): string =>
    value.replace(CONTROL, ' ').trim().slice(0, max);
  const trailers = [
    'Nevo-Operation: ' + request.operationId,
    'Nevo-Kind: ' + request.kind,
    ...Object.entries(request.trailers ?? {}).map(([key, value]) => key + ': ' + line(value, 200)),
  ].join('\n');
  // A user-controlled line that looks like a trailer is neutralised (defence in depth: only the
  // real trailer block is ever parsed).
  const text = (value: string, max: number): string => {
    const clean = line(value, max);
    return /^Nevo-[A-Za-z]+\s*:/iu.test(clean) ? '> ' + clean : clean;
  };
  if (request.kind === 'manual-commit') {
    // The person's text: a subject and a multi-line body, cleaned and neutralised line by line.
    const subject = commitSubjectForGit(request.subject, COMMIT_SUBJECT_MAX);
    const multiline = request.body ? commitBodyForGit(request.body) : '';
    return ['-m', subject, ...(multiline ? ['-m', multiline] : []), '-m', trailers];
  }
  if (request.kind === 'document-change') {
    // The Engine's own list of the changes (document names are user input): cleaned the same way.
    const multiline = request.body ? commitBodyForGit(request.body) : '';
    return [
      '-m',
      text(request.subject, 200),
      ...(multiline ? ['-m', multiline] : []),
      '-m',
      trailers,
    ];
  }
  const body = request.body ? text(request.body, 100) : '';
  return ['-m', text(request.subject, 200), ...(body ? ['-m', body] : []), '-m', trailers];
}

/** The user's configured identity as `Name <email>`, or undefined (the Engine authors then). */
async function userAuthor(root: string, run: GitReader): Promise<string | undefined> {
  const read = async (key: string): Promise<string> => {
    const result = await run(root, ['config', '--get', key]);
    return result.exitCode === 0
      ? result.stdout.replace(CONTROL, ' ').replace(/[<>]/gu, '').trim()
      : '';
  };
  const name = await read('user.name');
  const email = await read('user.email');
  return name && email ? name + ' <' + email + '>' : undefined;
}

/** Absolute locations of Git state files (correct for linked worktrees) in ONE Git process. */
async function resolveGitPaths(
  root: string,
  names: readonly string[],
  run: GitReader,
): Promise<ReadonlyMap<string, string>> {
  const result = await run(root, ['rev-parse', ...names.flatMap((name) => ['--git-path', name])]);
  const lines = result.stdout.split('\n').filter(Boolean);
  if (result.exitCode !== 0 || lines.length !== names.length) throw blocked('git-path-unreadable');
  return new Map(
    names.map((name, index) => [
      name,
      isAbsolute(lines[index]!) ? lines[index]! : join(root, lines[index]!),
    ]),
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function indexUnlocked(lockPath: string): Promise<boolean> {
  for (let attempt = 0; attempt <= LOCK_RETRIES; attempt++) {
    if (!(await exists(lockPath))) return true;
    if (attempt < LOCK_RETRIES) await delay(LOCK_RETRY_MS);
  }
  return false;
}

/**
 * Git refused to take a lock or to move the ref because another writer got there first: the index
 * lock, or the compare-and-swap on HEAD ("cannot lock ref 'HEAD': is at X but expected Y",
 * "Unable to create '...lock'"). Git refuses these before changing anything, so the command
 * provably changed nothing and retrying it is safe.
 */
function lostWriteRace(stderr: string): boolean {
  return /index.lock|cannot lock ref|Unable to create '[^']*.lock'/u.test(stderr);
}

/** A refused lock or ref update proves the command changed nothing, so retrying it is safe. */
async function withLockRetry(
  run: () => Promise<{ readonly exitCode: number; readonly stderr: string }>,
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  let result = await run();
  for (
    let attempt = 0;
    attempt < LOCK_RETRIES * 4 && result.exitCode !== 0 && lostWriteRace(result.stderr);
    attempt++
  ) {
    await delay(LOCK_RETRY_MS);
    result = await run();
  }
  return result;
}

const checkoutQueues = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier task for the same checkout settled (failures do not block the queue). */
function serializePerCheckout<T>(root: string, task: () => Promise<T>): Promise<T> {
  const previous = checkoutQueues.get(root) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  checkoutQueues.set(root, tail);
  void tail.then(() => {
    if (checkoutQueues.get(root) === tail) checkoutQueues.delete(root);
  });
  return run;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isMissing(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'code' in value && value.code === 'ENOENT';
}
