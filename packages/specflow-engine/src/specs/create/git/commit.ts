import { sha256 } from '../scaffold-writer';
import type { SpecFlowEngine } from '../../../application';
import { GitCapabilityError } from '../../../git/errors';
import { openVersionControl } from '../../../version-control';
import { engineCommitRefusal } from '../../../version-control/commits/branch-patterns';
import type {
  CommitPort,
  EngineCommitRequest,
  FoundCommit,
} from '../../../version-control/commits/port';
import type { GitCommitsPolicy } from '../../../version-control/worktrees/policy';
import { CreateOperationError, type CreateJournal } from '../journal';

interface ScaffoldCommitInput {
  readonly root: string;
  readonly branch: string;
  readonly paths: readonly string[];
  readonly operationId: string;
  readonly slug: string;
  readonly title: string;
  readonly specId: string;
}

function requestOf(input: ScaffoldCommitInput): EngineCommitRequest {
  return {
    root: input.root,
    expectedBranch: input.branch,
    paths: input.paths,
    operationId: input.operationId,
    kind: 'specification-create',
    subject: 'spec(create): ' + input.slug,
    body: input.title,
    trailers: { 'Nevo-Spec': input.specId },
  };
}

/**
 * Admission for a Create into an EXISTING checkout (Git enabled): nothing is reserved, written or
 * journalled unless the Engine may commit on the checkout's current branch right now. Returns the
 * branch to pin in the journal.
 */
export async function admitExistingCreateCommit(
  engine: SpecFlowEngine,
  input: Omit<ScaffoldCommitInput, 'branch'>,
): Promise<string> {
  const commits = openVersionControl(engine).commits;
  const branch = await commits.currentBranch(input.root);
  await commits.preflight(requestOf({ ...input, branch }));
  return branch;
}

/**
 * Admission for a NEW worktree: the generated or typed branch name is evaluated and never silently
 * renamed. Evaluated against the new branch only, not the base ref or the integration destination.
 */
export function admitNewWorktreeCreateCommit(policy: GitCommitsPolicy, branch: string): void {
  const refusal = engineCommitRefusal(policy, branch);
  if (refusal) {
    throw new GitCapabilityError(
      'BRANCH_PROTECTED',
      'The Engine does not commit on this branch.',
      refusal,
    );
  }
}

export function scaffoldPaths(record: CreateJournal): readonly string[] {
  return record.files.map((file) => file.relativePath);
}

/**
 * The journal stage `commit-writing`: make sure the scaffold is committed exactly once. Replay finds
 * an existing commit by its operation trailer; a scaffold committed by a human (identical bytes, clean)
 * is accepted; anything ambiguous is a recovery. Files already exist at this point, so a refusal here
 * is surfaced as `COMMIT_FAILED` (recovery required), never as the "nothing was created" admission codes.
 */
export async function ensureScaffoldCommitted(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<string> {
  const evidence = record.commit;
  if (!evidence?.parentHead) throw recovery('Create journal has no commit intent.');
  const commits = openVersionControl(engine).commits;
  const root = record.target.workspaceRoot;
  const paths = scaffoldPaths(record);
  try {
    const found = await commits.findByOperation(root, record.operationId, evidence.parentHead);
    if (found.status === 'history-changed') {
      throw recovery('Git history no longer contains the commit parent; manual recovery required.');
    }
    if (found.status === 'found') {
      await verifyCommittedScaffold(commits, root, found, record);
      return found.sha;
    }
    const state = await commits.inspectPaths(root, paths);
    if (state.state === 'committed') return state.sha;
    if (state.state === 'mixed') {
      throw recovery('Scaffold files are partly committed or modified; manual recovery required.');
    }
    return (
      await commits.commit(
        requestOf({
          root,
          branch: evidence.branch,
          paths,
          operationId: record.operationId,
          slug: record.slug,
          title: record.title,
          specId: record.specId,
        }),
      )
    ).sha;
  } catch (error) {
    if (
      error instanceof GitCapabilityError &&
      (error.code === 'BRANCH_PROTECTED' || error.code === 'COMMIT_BLOCKED')
    ) {
      throw new GitCapabilityError(
        'COMMIT_FAILED',
        'The Engine commit failed.',
        error.code + ':' + (error.reason ?? ''),
      );
    }
    throw error;
  }
}

async function verifyCommittedScaffold(
  commits: CommitPort,
  root: string,
  found: Extract<FoundCommit, { status: 'found' }>,
  record: CreateJournal,
): Promise<void> {
  const expected = [...scaffoldPaths(record)].sort();
  if (
    found.paths.length !== expected.length ||
    !expected.every((path, index) => path === found.paths[index])
  ) {
    throw recovery('The scaffold commit does not contain exactly the scaffold files.');
  }
  for (const file of record.files) {
    const content = await commits.fileAt(root, found.sha, file.relativePath);
    if (content === undefined || sha256(content) !== file.sha256) {
      throw recovery('The scaffold commit content differs from the recorded creation intent.');
    }
  }
}

/** Branch/history lineage of a new worktree once the scaffold commit may exist. */
export async function requireCommitLineage(
  engine: SpecFlowEngine,
  record: CreateJournal,
): Promise<void> {
  const target = record.target;
  const evidence = record.commit;
  if (target.kind !== 'new-worktree' || !evidence) return;
  const commits = openVersionControl(engine).commits;
  const head = await commits.head(target.workspaceRoot);
  // Before the commit is proven, HEAD is the base or one descendant; afterwards it contains the commit.
  const anchor = evidence.commitSha ?? target.baseCommit;
  if (!head || !(await commits.isAncestor(target.workspaceRoot, anchor, head))) {
    throw recovery('Git worktree history changed since creation.');
  }
}

function recovery(message: string): CreateOperationError {
  return new CreateOperationError('CREATE_RECOVERY_REQUIRED', message);
}
