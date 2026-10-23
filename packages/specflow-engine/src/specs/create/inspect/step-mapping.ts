import type { CreateStage } from '../journal/model';

/** Stable public step vocabulary of a Create (never raw journal stages). */
export type PublicCreateStepId =
  | 'reserving'
  | 'preparing-workspace'
  | 'writing-specification'
  | 'committing-specification'
  | 'registering';

/**
 * The one mapping from a durable Create stage onto the public step the operation is in. Live
 * progress (Runtime registry) and the journal-derived listing use it, so both always agree.
 *
 * Total: a terminal stage (`completed`, `recovery-required`) and an unknown stage have no step.
 * `commits` is `Boolean(journal.commit)`: a Create that never commits has no commit step, so its
 * (unreachable) commit stages fall back to writing the specification.
 */
export function createStepForStage(
  stage: CreateStage | (string & {}),
  target: 'existing' | 'new-worktree',
  commits: boolean,
): PublicCreateStepId | undefined {
  switch (stage) {
    case 'reserved':
      return 'reserving';
    case 'git-initiated':
    case 'git-provisioned':
      // Existing targets have no workspace step; their identity check belongs to reserving.
      return target === 'new-worktree' ? 'preparing-workspace' : 'reserving';
    case 'manifest-writing':
    case 'manifest-written':
      return 'writing-specification';
    case 'commit-writing':
    case 'commit-written':
      return commits ? 'committing-specification' : 'writing-specification';
    case 'registry-writing':
    case 'registry-linked':
      return 'registering';
    default:
      return undefined;
  }
}
