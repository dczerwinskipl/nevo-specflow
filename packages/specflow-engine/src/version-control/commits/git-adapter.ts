import { lstat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { GitCapabilityError } from '../../git/errors';
import { executeGitMutation } from '../../git/mutation';
import { executeGit } from '../../git/process';
import { disabledIntegrationHooksDirectory } from '../../specs/lifecycle';
import { readProjectGitPolicy } from '../worktrees/config';
import { engineCommitRefusal } from './branch-patterns';
import type { CommitPort, EngineCommitRequest, FoundCommit, PathsState } from './port';

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
const LOCK_RETRIES = 3;
const LOCK_RETRY_MS = 200;

/** Internal Engine composition; the mutating commit never leaves the Engine package. */
export function createGitCommitPort(
  engine: SpecFlowEngine,
  /** Test seam: runs inside the window between the checks and `git commit`. */
  testHooks?: {
    readonly afterPreflight?: () => Promise<void>;
    readonly afterRecheck?: () => Promise<void>;
  },
): CommitPort {
  const head = async (root: string): Promise<string | undefined> => {
    const result = await executeGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
    const sha = result.stdout.trim();
    return result.exitCode === 0 && OBJECT_ID.test(sha) ? sha : undefined;
  };

  /** HEAD is attached to exactly the expected branch and the committed policy allows committing there. */
  const assertAttachedToExpected = async (request: EngineCommitRequest): Promise<void> => {
    const attached = await executeGit(request.root, ['symbolic-ref', '--quiet', 'HEAD']);
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

    const gitPaths = await resolveGitPaths(root, [...BUSY_STATE, 'index.lock']);
    for (const name of BUSY_STATE) {
      if (await exists(gitPaths.get(name)!)) throw blocked('git-busy');
    }
    const unmerged = await executeGit(root, ['ls-files', '--unmerged', '-z']);
    if (unmerged.exitCode !== 0) throw blocked('index-unreadable');
    if (unmerged.stdout.length > 0) throw blocked('unmerged-paths');
    if (!(await head(root))) throw blocked('no-commits');

    // One process for every path; it lists the ignored ones (exit 0) or nothing (exit 1).
    const ignored = await executeGit(root, ['check-ignore', '--no-index', '--', ...request.paths]);
    if (ignored.exitCode === 0 && ignored.stdout.trim().length > 0) throw blocked('path-ignored');
    if (ignored.exitCode !== 0 && ignored.exitCode !== 1) throw blocked('ignore-check-failed');
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
    const ancestor = await executeGit(root, ['merge-base', '--is-ancestor', sinceHead, 'HEAD']);
    if (ancestor.exitCode === 1) return { status: 'history-changed' };
    if (ancestor.exitCode !== 0) throw inspectionFailed('merge-base');
    // The operation is read from the REAL trailer block (`%(trailers)` parses only the last
    // paragraph, like `git interpret-trailers`) and only on a commit the Engine itself committed
    // (Engine committer identity). A title or body line that looks like a trailer, or a user commit
    // that quotes one, can therefore never claim an operation.
    const log = await executeGit(root, [
      'log',
      '--format=%x1e%H%x1f%ce%x1f%(trailers:key=Nevo-Operation,valueonly=true,unfold=true,separator=%x1d)',
      sinceHead + '..HEAD',
    ]);
    if (log.exitCode !== 0) throw inspectionFailed('log');
    const shas = log.stdout
      .split('\x1e')
      .map((record) => record.split('\x1f'))
      .filter(
        ([, committer, trailers]) =>
          committer?.trim() === ENGINE_EMAIL &&
          (trailers ?? '')
            .split('\x1d')
            .some((value) => value.trim().toLowerCase() === operationId.toLowerCase()),
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
    const changed = await executeGit(root, [
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
    const attached = await executeGit(root, ['symbolic-ref', '--quiet', 'HEAD']);
    const ref = attached.stdout.trim();
    if (attached.exitCode !== 0 || !ref.startsWith('refs/heads/')) throw blocked('detached');
    return ref.slice('refs/heads/'.length);
  };

  const inspectPaths = async (root: string, paths: readonly string[]): Promise<PathsState> => {
    const literals = paths.map((path) => ':(literal)' + path);
    const tree = await executeGit(root, [
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
    const status = await executeGit(root, [
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
    const last = await executeGit(root, ['log', '-1', '--format=%H', 'HEAD', '--', ...literals]);
    const sha = last.stdout.trim();
    if (last.exitCode !== 0 || !OBJECT_ID.test(sha)) throw inspectionFailed('log');
    return { state: 'committed', sha };
  };

  const fileAt = async (
    root: string,
    commitSha: string,
    path: string,
  ): Promise<string | undefined> => {
    if (!OBJECT_ID.test(commitSha)) throw inspectionFailed('object-id');
    const shown = await executeGit(root, ['show', commitSha + ':' + path]);
    return shown.exitCode === 0 ? shown.stdout : undefined;
  };

  const isAncestor = async (
    root: string,
    ancestor: string,
    descendant: string,
  ): Promise<boolean> => {
    if (!OBJECT_ID.test(ancestor) || !OBJECT_ID.test(descendant))
      throw inspectionFailed('object-id');
    const result = await executeGit(root, ['merge-base', '--is-ancestor', ancestor, descendant]);
    if (result.exitCode === 0) return true;
    if (result.exitCode === 1) return false;
    throw inspectionFailed('merge-base');
  };

  return {
    preflight,
    findByOperation,
    head,
    currentBranch,
    inspectPaths,
    fileAt,
    isAncestor,
    // Commits in one checkout run one at a time inside this process (they all move the same HEAD);
    // another process is covered by the lost-race retries below.
    commit: (request) =>
      serializePerCheckout(request.root, async () => {
        await preflight(request);
        const { root } = request;
        const parentHead = await head(root);
        if (!parentHead) throw blocked('no-commits');
        const hooks = await disabledIntegrationHooksDirectory(engine);
        const literals = request.paths.map((path) => ':(literal)' + path);

        // Makes untracked scaffold files "known" to Git (so `--only` accepts them) without staging
        // their content; nothing else in the index is touched.
        const added = await withLockRetry(() =>
          executeGitMutation(root, ['add', '--intent-to-add', '--', ...literals]),
        );
        if (added.exitCode !== 0) throw failed('intent-to-add');

        const author = await userAuthor(root);
        // `git commit` commits on whatever HEAD is at that moment: confirm the branch (and its
        // protection) once more immediately before it, and verify where the commit landed after.
        await testHooks?.afterPreflight?.();
        await assertAttachedToExpected(request);
        await testHooks?.afterRecheck?.();
        const committed = await withLockRetry(() =>
          executeGitMutation(root, [
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
            '--',
            ...literals,
          ]),
        );
        // A non-zero exit does not prove "nothing happened": look for our commit by its trailer.
        const found = await findByOperation(root, request.operationId, parentHead);
        if (found.status === 'found') {
          if (!sameSet(found.paths, request.paths)) {
            throw new GitCapabilityError(
              'GIT_OPERATION_UNCERTAIN',
              'The Engine commit does not contain exactly the expected paths.',
              'unexpected-commit-content',
            );
          }
          const landed = await executeGit(root, [
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
        if (committed.exitCode !== 0) throw failed('commit-exit-' + String(committed.exitCode));
        throw new GitCapabilityError(
          'GIT_OPERATION_UNCERTAIN',
          'The Engine commit reported success but cannot be found.',
          'commit-not-found',
        );
      }),
  };
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
  const body = request.body ? text(request.body, 100) : '';
  return ['-m', text(request.subject, 200), ...(body ? ['-m', body] : []), '-m', trailers];
}

/** The user's configured identity as `Name <email>`, or undefined (the Engine authors then). */
async function userAuthor(root: string): Promise<string | undefined> {
  const read = async (key: string): Promise<string> => {
    const result = await executeGit(root, ['config', '--get', key]);
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
): Promise<ReadonlyMap<string, string>> {
  const result = await executeGit(root, [
    'rev-parse',
    ...names.flatMap((name) => ['--git-path', name]),
  ]);
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

function blocked(reason: string): GitCapabilityError {
  return new GitCapabilityError(
    'COMMIT_BLOCKED',
    'The checkout cannot take an Engine commit right now.',
    reason,
  );
}

function failed(reason: string): GitCapabilityError {
  return new GitCapabilityError('COMMIT_FAILED', 'The Engine commit failed.', reason);
}

function inspectionFailed(reason: string): GitCapabilityError {
  return new GitCapabilityError('GIT_OPERATION_FAILED', 'Unable to inspect Git history.', reason);
}

function isMissing(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'code' in value && value.code === 'ENOENT';
}
