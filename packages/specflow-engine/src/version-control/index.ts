import type { SpecFlowEngine } from '../application';
import { createGitCommitPort } from './commits/git-adapter';
import type { CommitPort } from './commits/port';
import { createGitWorktreePort } from './worktrees/git-adapter';
import type { WorktreePort } from './worktrees/port';

/** Engine-internal composition only; never exported from src/index.ts. */
export interface VersionControl {
  readonly worktrees: WorktreePort;
  /** The only way the Engine commits: path-limited and guarded by the protected-branch policy. */
  readonly commits: CommitPort;
}

export function openVersionControl(engine: SpecFlowEngine): VersionControl {
  return { worktrees: createGitWorktreePort(engine), commits: createGitCommitPort(engine) };
}
