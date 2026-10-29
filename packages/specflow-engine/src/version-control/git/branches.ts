import { executeGit } from '../../git/process';

export interface LocalBranches {
  /** Short names of the local branches (`refs/heads`), empty for a repository without commits. */
  readonly branches: readonly string[];
  /** The attached branch (also for an unborn one), `undefined` when HEAD is detached. */
  readonly current?: string;
}

/**
 * Read-only facts for setup flows that run BEFORE a Project Home exists (`init`): the local
 * branches and the current one of a checkout. Tolerant by design: any Git failure yields "nothing
 * known" so the caller can explain how to fix the repository instead of crashing.
 */
export async function inspectLocalBranches(root: string): Promise<LocalBranches> {
  const read = async (args: readonly string[]): Promise<string | undefined> => {
    try {
      const result = await executeGit(root, args);

      return result.exitCode === 0 ? result.stdout : undefined;
    } catch {
      return undefined;
    }
  };

  const listed = await read(['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  const head = await read(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const current = head?.trim();

  return {
    branches: (listed ?? '')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean),
    ...(current ? { current } : {}),
  };
}
