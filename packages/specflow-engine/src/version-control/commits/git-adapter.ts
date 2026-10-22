import { lstat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { GitCapabilityError } from '../../git/errors';
import { executeGitMutation } from '../../git/mutation';
import { executeGit } from '../../git/process';
import { disabledIntegrationHooksDirectory } from '../../specs/lifecycle/git-scratch';
import { readProjectGitPolicy } from '../worktrees/config';
import { engineCommitRefusal } from './branch-patterns';
import type { CommitPort, EngineCommitRequest, FoundCommit } from './port';

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
export function createGitCommitPort(engine: SpecFlowEngine): CommitPort {
  const head = async (root: string): Promise<string | undefined> => {
    const result = await executeGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
    const sha = result.stdout.trim();
    return result.exitCode === 0 && OBJECT_ID.test(sha) ? sha : undefined;
  };

  const preflight = async (request: EngineCommitRequest): Promise<void> => {
    validateRequest(request);
    const { root } = request;
    const attached = await executeGit(root, ['symbolic-ref', '--quiet', 'HEAD']);
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

    for (const name of BUSY_STATE) {
      if (await gitPathExists(root, name)) throw blocked('git-busy');
    }
    const unmerged = await executeGit(root, ['ls-files', '--unmerged', '-z']);
    if (unmerged.exitCode !== 0) throw blocked('index-unreadable');
    if (unmerged.stdout.length > 0) throw blocked('unmerged-paths');
    if (!(await head(root))) throw blocked('no-commits');

    for (const path of request.paths) {
      const ignored = await executeGit(root, ['check-ignore', '-q', '--no-index', '--', path]);
      if (ignored.exitCode === 0) throw blocked('path-ignored');
      if (ignored.exitCode !== 1) throw blocked('ignore-check-failed');
    }
    if (!(await indexUnlocked(root))) throw blocked('index-locked');
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
    const log = await executeGit(root, [
      'log',
      '--format=%H',
      '-E',
      '--grep=^Nevo-Operation: ' + operationId + '$',
      sinceHead + '..HEAD',
    ]);
    if (log.exitCode !== 0) throw inspectionFailed('log');
    const shas = log.stdout.split('\n').filter(Boolean);
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

  return {
    preflight,
    findByOperation,
    head,
    async commit(request) {
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
    },
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
  const body = request.body ? line(request.body, 100) : '';
  return ['-m', line(request.subject, 200), ...(body ? ['-m', body] : []), '-m', trailers];
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

async function gitPathExists(root: string, name: string): Promise<boolean> {
  const result = await executeGit(root, ['rev-parse', '--git-path', name]);
  if (result.exitCode !== 0) throw blocked('git-path-unreadable');
  const printed = result.stdout.trim();
  try {
    await lstat(isAbsolute(printed) ? printed : join(root, printed));
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function indexUnlocked(root: string): Promise<boolean> {
  for (let attempt = 0; attempt <= LOCK_RETRIES; attempt++) {
    if (!(await gitPathExists(root, 'index.lock'))) return true;
    if (attempt < LOCK_RETRIES) await delay(LOCK_RETRY_MS);
  }
  return false;
}

/** A refused index lock proves the command changed nothing, so retrying it is safe. */
async function withLockRetry(
  run: () => Promise<{ readonly exitCode: number; readonly stderr: string }>,
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  let result = await run();
  for (
    let attempt = 0;
    attempt < LOCK_RETRIES * 4 && result.exitCode !== 0 && /index\.lock/u.test(result.stderr);
    attempt++
  ) {
    await delay(LOCK_RETRY_MS);
    result = await run();
  }
  return result;
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
