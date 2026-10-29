import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../../application';
import { GitCapabilityError } from '../../../git/errors';
import type { CommitPort } from '../../../version-control/commits/port';
import { readProjectGitPolicy } from '../../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../../version-control/worktrees/policy';
import { documentChangeError } from '../changes/errors';
import {
  GitPreflightCache,
  preflightKey,
  readPreflightSignature,
  type PreflightSignatureReader,
} from './preflight-cache';

/**
 * Whether a write needs a commit, and on which branch it is made. `manual`: Git is enabled but
 * auto-commit is off for the documents (ADR 0018), so no commit will be made by the queue, no
 * preflight ran, and the branch is only what HEAD names now (`null` on a detached HEAD).
 */
export type GitAdmission =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly mode: 'auto'; readonly branch: string }
  | { readonly enabled: true; readonly mode: 'manual'; readonly branch: string | null };

export interface GitPreflightOptions {
  readonly cache?: GitPreflightCache;
  readonly signature?: PreflightSignatureReader;
}

/** The process-wide cache production uses when the caller passes none. */
const processCache = new GitPreflightCache();

/**
 * The commit port's read-only preflight for the paths of a write, before any file is written. With
 * Git disabled nothing runs; with auto-commit off for the documents no preflight runs either (no commit
 * will happen, so a protected branch, a detached HEAD or a merge in progress do not prevent editing).
 * The policy is read fresh at every admission. A hit of the cache (same checkout, branch ref and path set, signatures
 * unchanged, younger than 2 s) starts no Git process; a miss costs the port's preflight (five Git
 * read processes, six above 100 paths). Every refusal is a document error; nothing is cached for it.
 */
export async function admitGitCommit(
  engine: SpecFlowEngine,
  commits: CommitPort,
  root: string,
  paths: readonly string[],
  options: GitPreflightOptions = {},
): Promise<GitAdmission> {
  const cache = options.cache ?? processCache;
  let policy;
  try {
    policy = (await readProjectGitPolicy(engine.context)).policy;
  } catch (error) {
    throw gitRefusal(error);
  }
  if (!policy.enabled) return { enabled: false };
  const signature = await (options.signature ?? readPreflightSignature)(engine.context, root);
  if (!effectiveAutoCommit(policy, 'documents').auto) {
    return { enabled: true, mode: 'manual', branch: signature.branchRef ?? null };
  }
  if (signature.branchRef !== undefined && !signature.indexLocked) {
    const key = preflightKey(root, signature.branchRef, paths);
    if (cache.has(key, signature.token)) {
      return { enabled: true, mode: 'auto', branch: signature.branchRef };
    }
  }
  try {
    const branch = signature.branchRef ?? (await commits.currentBranch(root));
    await commits.preflight({
      root,
      expectedBranch: branch,
      paths,
      operationId: randomUUID(),
      kind: 'document-change',
      subject: 'preflight',
    });
    if (signature.branchRef === branch && !signature.indexLocked) {
      cache.remember(preflightKey(root, branch, paths), signature.token);
    }
    return { enabled: true, mode: 'auto', branch };
  } catch (error) {
    throw gitRefusal(error);
  }
}

/** Maps what the Git layer refuses with onto the document error vocabulary. */
export function gitRefusal(error: unknown): unknown {
  if (!(error instanceof GitCapabilityError)) return error;
  switch (error.code) {
    case 'BRANCH_PROTECTED':
      return documentChangeError(
        error.reason === 'branch-not-allowed' ? 'branch-not-allowed' : 'branch-protected',
        'The Engine does not commit on this branch.',
      );
    case 'GIT_POLICY_INVALID':
      return documentChangeError('git-policy-invalid', 'The Git policy of the project is invalid.');
    case 'COMMIT_BLOCKED':
      return documentChangeError(
        'commit-blocked',
        'The checkout cannot take an Engine commit right now.',
        error.reason !== undefined ? { blockedBy: error.reason } : {},
      );
    default:
      return documentChangeError('commit-blocked', 'Git is not available for this checkout.', {
        blockedBy: 'git-unavailable',
      });
  }
}
