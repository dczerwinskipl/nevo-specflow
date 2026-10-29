import { GitCapabilityError } from './errors';
import {
  BoundedGitOutput,
  onGitProcessEnd,
  spawnLocalGit,
  terminateGitProcessTree,
} from './process-shared';
import { spawnFailureReason, type GitCommandResult } from './process';

const MAX_OUTPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 30000;
const TERMINATION_GRACE_MS = 3000;
/** After SIGTERM (git removes its lock files on it) the group is killed outright. */
const ESCALATION_MS = 1500;
/** After `exit`, how long the pipes may stay open before the output read so far is final. */
const OUTPUT_GRACE_MS = 1000;

/** `GitCapabilityError.reason` of an uncertain mutation whose git process tree is provably gone. */
export const MUTATION_TERMINATED = 'terminated';
/** `GitCapabilityError.reason` when git did not exit after being killed. */
export const MUTATION_NOT_TERMINATED = 'not-terminated';

export interface GitMutationOptions {
  /** Deadline of this one process (default 30 s). */
  readonly timeoutMs?: number;
  /** How long a terminated process may take to exit before the outcome is not-terminated (default 3 s). */
  readonly terminationGraceMs?: number;
}

/**
 * Dedicated mutating Git adapter. Unlike read-only Git probes, a timeout is
 * NEVER a proof of no side effects: it ends as `GIT_OPERATION_UNCERTAIN`.
 *
 * The outcome is resolved on process `exit`, not on `close`: a clean-filter grandchild that survives
 * git keeps the pipes open and `close` would never fire. On timeout the whole process group
 * (POSIX, SIGTERM then SIGKILL) or tree (Windows) is killed. The uncertain error carries the reason
 * `MUTATION_TERMINATED` when git exited (the caller may then decide from Git evidence) or
 * `MUTATION_NOT_TERMINATED` when it did not.
 *
 * The caller must first persist an intent and must not automatically replay an
 * uncertain result without Git evidence.
 */
export async function executeGitMutation(
  cwd: string,
  args: readonly string[],
  options: GitMutationOptions = {},
): Promise<GitCommandResult> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const graceMs = options.terminationGraceMs ?? TERMINATION_GRACE_MS;

  return new Promise((resolve, reject) => {
    const child = spawnLocalGit(cwd, args);
    const output = new BoundedGitOutput(MAX_OUTPUT_BYTES);
    let uncertain = false;
    let settled = false;
    let terminationTimer: NodeJS.Timeout | undefined;
    let escalationTimer: NodeJS.Timeout | undefined;

    const settle = (outcome: GitCommandResult | GitCapabilityError): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (terminationTimer) {
        clearTimeout(terminationTimer);
      }

      if (escalationTimer) {
        clearTimeout(escalationTimer);
      }

      if (outcome instanceof GitCapabilityError) {
        reject(outcome);
      } else {
        resolve(outcome);
      }
    };

    const terminate = (): void => {
      if (uncertain || settled) {
        return;
      }

      uncertain = true;
      terminateGitProcessTree(child, 'SIGTERM');
      escalationTimer = setTimeout(
        () => terminateGitProcessTree(child, 'SIGKILL'),
        Math.min(ESCALATION_MS, graceMs),
      );
      escalationTimer.unref();
      terminationTimer = setTimeout(() => {
        terminateGitProcessTree(child, 'SIGKILL');
        settle(
          new GitCapabilityError(
            'GIT_OPERATION_UNCERTAIN',
            'Mutating Git process did not terminate after cancellation; explicit recovery required.',
            MUTATION_NOT_TERMINATED,
          ),
        );
      }, graceMs);
      terminationTimer.unref();
    };

    const timeout = setTimeout(terminate, timeoutMs);
    timeout.unref();

    const collect = (channel: 'stdout' | 'stderr', data: Buffer): void => {
      if (!output.write(channel, data)) {
        terminate();

        return;
      }
    };

    child.stdout.on('data', (data: Buffer) => collect('stdout', data));
    child.stderr.on('data', (data: Buffer) => collect('stderr', data));
    child.on('error', (error) => {
      settle(
        new GitCapabilityError(
          'GIT_OPERATION_UNCERTAIN',
          'Mutating Git process could not be started or observed reliably.',
          spawnFailureReason(error),
        ),
      );
    });
    child.on('exit', () => {
      if (!uncertain) {
        return;
      }

      // Git is gone; sweep what it left behind (a filter that ignored SIGTERM) and settle at once.
      terminateGitProcessTree(child, 'SIGKILL', { sweep: true });
      settle(
        new GitCapabilityError(
          'GIT_OPERATION_UNCERTAIN',
          'Mutating Git execution was interrupted; inspect effects before retrying.',
          MUTATION_TERMINATED,
        ),
      );
    });
    onGitProcessEnd(child, OUTPUT_GRACE_MS, (code) => {
      if (uncertain) {
        settle(
          new GitCapabilityError(
            'GIT_OPERATION_UNCERTAIN',
            'Mutating Git execution was interrupted; inspect effects before retrying.',
            MUTATION_TERMINATED,
          ),
        );
      } else {
        settle({ exitCode: code ?? -1, ...output.finish() });
      }
    });
  });
}
