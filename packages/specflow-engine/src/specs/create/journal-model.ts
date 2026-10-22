import type { CreateClientIntent } from '../create-intent';
import type { WorkspaceIntegrationDestination } from '../../project/workspace-registry';

export const CREATE_STAGES = [
  'reserved',
  'git-initiated',
  'git-provisioned',
  'manifest-writing',
  'manifest-written',
  // Only when the journal carries `commit` (git.enabled at reservation): the scaffold is committed
  // by the Engine between the manifest and the registry binding.
  'commit-writing',
  'commit-written',
  'registry-writing',
  'registry-linked',
  'completed',
  'recovery-required',
] as const;

export type CreateStage = (typeof CREATE_STAGES)[number];

export interface ExistingJournalTarget {
  readonly kind: 'existing';
  readonly workspaceId: string;
  readonly workspaceRoot: string;
}

export interface NewWorktreeJournalTarget {
  readonly kind: 'new-worktree';
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly instanceId: string;
  readonly integrationDestination?: WorkspaceIntegrationDestination;
}

export type CreateJournalTarget = ExistingJournalTarget | NewWorktreeJournalTarget;

export interface CreateJournalFile {
  readonly relativePath: string;
  readonly sha256: string;
}

/**
 * Pinned at reservation iff `git.enabled`; absent = this Create never commits (Git disabled, or a
 * journal reserved before commits existed) and keeps the stage graph `manifest-written -> registry-writing`.
 */
export interface CreateCommitEvidence {
  readonly required: true;
  /** Short branch the scaffold is committed on (the checkout's current branch, or the new branch). */
  readonly branch: string;
  /** HEAD recorded together with the `commit-writing` transition, i.e. BEFORE the Git effect. */
  readonly parentHead?: string;
  /** Recorded with `commit-written`. */
  readonly commitSha?: string;
}

/** Single current durable Create format. No unpublished prototype migrations. */
export interface CreateJournal {
  readonly version: 2;
  readonly projectId: string;
  readonly operationId: string;
  readonly requestIntent: CreateClientIntent;
  readonly inputFingerprint: string;
  readonly specId: string;
  readonly slug: string;
  readonly title: string;
  readonly created: string;
  readonly goal?: string;
  readonly stage: CreateStage;
  readonly target: CreateJournalTarget;
  readonly files: readonly CreateJournalFile[];
  readonly gitPlan?: { readonly projectRoot: string; readonly gitInstanceId: string };
  readonly commit?: CreateCommitEvidence;
  readonly reason?: string;
}
