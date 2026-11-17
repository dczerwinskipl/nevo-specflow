import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ProviderEnvironment } from '../process';

export const MAX_EXECUTABLE_BYTES = 512 * 1024 * 1024;

/** A failed version command, said in a few words: why it did not answer. */
export class CommandFailure extends Error {}

/** The file system and process access of executable discovery; tests pass fakes. */
export interface ExecutableFiles {
  /** `lstat`: a symbolic link or junction is reported as such, never followed. */
  stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mtimeMs: number;
  }>;
  list(directory: string): Promise<string[]>;
  /**
   * Runs a fixed command without a shell and returns its standard output. Rejects with a
   * `CommandFailure` when it cannot start, exits unsuccessfully or does not finish in time.
   */
  run(
    executable: string,
    args: readonly string[],
    options: { environment: ProviderEnvironment; timeoutMs: number },
  ): Promise<string>;
  hash(path: string): Promise<string>;
}

export const nodeExecutableFiles: ExecutableFiles = {
  stat: lstat,
  list: (directory) => readdir(directory),
  run(executable, args, options) {
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        [...args],
        {
          shell: false,
          windowsHide: true,
          timeout: options.timeoutMs,
          maxBuffer: 64 * 1024,
          env: { ...options.environment.values },
          // Neither the project nor the executable's own folder: a CLI may read configuration
          // from its working directory.
          cwd: tmpdir(),
          encoding: 'utf8',
        },
        (error, stdout) => {
          if (!error) {
            resolve(stdout);

            return;
          }

          // `code` is the exit code once the process ran, an errno string when it could not start.
          const { killed, code } = error as { killed?: boolean; code?: unknown };
          reject(
            new CommandFailure(
              killed
                ? `it did not answer within ${options.timeoutMs / 1000} s`
                : typeof code === 'number'
                  ? `it exited with code ${String(code)}`
                  : 'it could not be started',
            ),
          );
        },
      );
    });
  },
  async hash(path) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(path)) {
      bytes += (chunk as Buffer).length;
      if (bytes > MAX_EXECUTABLE_BYTES) {
        throw new Error('Executable exceeds its size budget.');
      }

      hash.update(chunk as Buffer);
    }

    return hash.digest('hex');
  },
};
