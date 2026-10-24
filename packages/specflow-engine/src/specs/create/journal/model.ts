import type { CreateClientIntent } from '../intent';
import type { WorkspaceIntegrationDestination } from '../../../project/workspace/registry/registry';

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

/**
 * Evidence of one scaffold file. The content is NOT in the journal: it lives in the hash-addressed
 * payload store (`payload.ts`), keyed by `sha256` and verified against `bytes` and `sha256`.
 */
export interface CreateJournalFile {
  readonly relativePath: string;
  readonly sha256: string;
  /** UTF-8 bytes of the content. */
  readonly bytes: number;
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

/**
 * The single current durable Create format. Older versions are never interpreted: they are
 * classified as unsupported (`unsupported.ts`) and never block Create or Close.
 */
export const CREATE_JOURNAL_VERSION = 2;

export interface CreateJournal {
  readonly version: typeof CREATE_JOURNAL_VERSION;
  readonly projectId: string;
  readonly operationId: string;
  readonly requestIntent: CreateClientIntent;
  readonly inputFingerprint: string;
  readonly specId: string;
  readonly slug: string;
  readonly title: string;
  readonly created: string;
  /** ISO instant of the reservation. Optional: journals reserved before it existed have none. */
  readonly startedAt?: string;
  readonly goal?: string;
  /**
   * Revision of the catalogue the scaffold was generated from. Diagnostic only: recovery reads the
   * payload and never the live catalogue, so a catalogue that changed since has no effect.
   */
  readonly catalogueRevision: string;
  /** Ids of the registered documents of the scaffold, in registry order. */
  readonly documentIds: readonly string[];
  readonly stage: CreateStage;
  readonly target: CreateJournalTarget;
  /** Manifest first, overview second (both fixed), then the remaining scaffold files; unique paths. */
  readonly files: readonly CreateJournalFile[];
  readonly gitPlan?: { readonly projectRoot: string; readonly gitInstanceId: string };
  readonly commit?: CreateCommitEvidence;
  readonly reason?: string;
}
