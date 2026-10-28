import {
  BoundedGitOutput,
  onGitProcessEnd,
  spawnLocalGit,
  terminateGitProcessTree,
} from './process-shared';

import { GitCapabilityError } from './errors';

const MAX_OUTPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10000;
/** After SIGTERM (git removes its lock files on it) the group is killed outright. */
const ESCALATION_MS = 1500;

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitReadOptions {
  /** Deadline of this one process (default 10 s). */
  readonly timeoutMs?: number;
}

/**
 * Engine-owned local Git process boundary for READ-ONLY commands. Never use shell interpolation, an
 * ambient Git context or provider/Runtime process adapters. A command that can hold the index lock
 * or move a ref goes through `executeGitMutation`, whose timeout is never a proof of "nothing
 * happened". When this reader has to end a process it sends SIGTERM first (so git releases the
 * locks it may hold, e.g. a probe that refreshes the index) and escalates to SIGKILL.
 */
export async function executeGit(
  cwd: string,
  args: readonly string[],
  options: GitReadOptions = {},
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawnLocalGit(cwd, args);
    let done = false;
    const output = new BoundedGitOutput(MAX_OUTPUT_BYTES);

    const fail = (error: GitCapabilityError): void => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      terminateGitProcessTree(child, 'SIGTERM');
      const escalation = setTimeout(() => terminateGitProcessTree(child, 'SIGKILL'), ESCALATION_MS);
      escalation.unref();
      child.once('exit', () => {
        clearTimeout(escalation);
        // Git is gone; sweep what it left behind (a helper that ignored SIGTERM).
        terminateGitProcessTree(child, 'SIGKILL', { sweep: true });
      });
      reject(error);
    };

    const timeout = setTimeout(() => {
      fail(new GitCapabilityError('GIT_UNAVAILABLE', 'Git command timed out.', 'timeout'));
    }, options.timeoutMs ?? TIMEOUT_MS);
    timeout.unref();

    const collect = (channel: 'stdout' | 'stderr', data: Buffer): void => {
      if (!output.write(channel, data)) {
        fail(new GitCapabilityError('GIT_OPERATION_FAILED', 'Git output exceeds safety limit.'));
        return;
      }
    };

    child.stdout.on('data', (data: Buffer) => collect('stdout', data));
    child.stderr.on('data', (data: Buffer) => collect('stderr', data));
    child.on('error', (error) => {
      fail(
        new GitCapabilityError(
          'GIT_UNAVAILABLE',
          'Git could not be started.',
          spawnFailureReason(error),
        ),
      );
    });
    onGitProcessEnd(child, 1000, (code) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve({ exitCode: code ?? -1, ...output.finish() });
    });
  });
}

/**
 * Why a Git process could not be started: `executable-unavailable` when there is no Git to run
 * (not found, not permitted), `spawn-failed` for anything that passes (out of descriptors,
 * processes or memory).
 */
export function spawnFailureReason(error: unknown): 'executable-unavailable' | 'spawn-failed' {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'EACCES' ? 'executable-unavailable' : 'spawn-failed';
}
