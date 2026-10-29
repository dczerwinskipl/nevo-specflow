import { spawn } from 'node:child_process';
import { isAbsolute, extname } from 'node:path';
import { readProviderLines } from './framing';
import { createDiagnosticStore, type DiagnosticStore } from './diagnostics';
import { terminateOwnedProcess, type ProcessDisposition } from './termination';
import type { InvocationScope, CleanupIssue } from './scope';
import type { ProviderEnvironment } from './environment';
import { createWindowsJob } from './windows-job';

export class ProviderProcessError extends Error {
  readonly code:
    'UNAVAILABLE' | 'START_FAILED' | 'CANCELLED' | 'PROTOCOL_FAILED' | 'INPUT_INVALID' | 'BUSY';
  readonly cleanup: readonly CleanupIssue[];
  constructor(
    code: ProviderProcessError['code'],
    message: string,
    cleanup: readonly CleanupIssue[] = [],
  ) {
    super(message);
    this.name = 'ProviderProcessError';
    this.code = code;
    this.cleanup = cleanup;
  }
}
export interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}
export async function launchOwnedProcess(options: {
  invocationId: string;
  scope: InvocationScope;
  executable: string;
  args: readonly string[];
  cwd: string;
  environment: ProviderEnvironment;
  signal: AbortSignal;
  diagnostics?: DiagnosticStore;
  secrets?: readonly string[];
  maxFrameBytes?: number;
}) {
  let child: ReturnType<typeof spawn>;
  let windowsJob: ReturnType<typeof createWindowsJob> | undefined;
  const secretValues = Object.keys(options.environment.sources)
    .filter((key) => options.environment.sources[key] === 'secret')
    .map((key) => options.environment.values[key]!);
  let capture: ReturnType<DiagnosticStore['open']>;
  try {
    capture = (options.diagnostics ?? createDiagnosticStore()).open(options.invocationId, [
      ...secretValues,
      ...(options.secrets ?? []),
    ]);
  } catch {
    const cleanup = await options.scope.close();

    throw new ProviderProcessError(
      'START_FAILED',
      'Provider diagnostic capacity is unavailable.',
      cleanup,
    );
  }

  try {
    if (
      !isAbsolute(options.executable) ||
      !isAbsolute(options.cwd) ||
      options.args.some((a) => a.includes('\0')) ||
      Buffer.byteLength(JSON.stringify(options.args)) > 1024 * 1024
    ) {
      throw new ProviderProcessError(
        'INPUT_INVALID',
        'Verified bounded provider command is required.',
      );
    }

    if (
      process.platform === 'win32' &&
      ['.cmd', '.bat', '.ps1'].includes(extname(options.executable).toLowerCase())
    ) {
      throw new ProviderProcessError(
        'INPUT_INVALID',
        'Resolve the provider launcher to its native executable or Node entrypoint.',
      );
    }

    if (options.signal.aborted) {
      throw new ProviderProcessError('CANCELLED', 'Provider startup was cancelled.');
    }

    windowsJob =
      process.platform === 'win32' ? createWindowsJob(options.executable, options.args) : undefined;
    child = spawn(
      windowsJob?.executable ?? options.executable,
      windowsJob?.args ?? [...options.args],
      {
        cwd: options.cwd,
        env: windowsJob?.environment ?? { ...options.environment.values },
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: windowsJob ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    await windowsJob?.stop();
    capture.release();
    const cleanup = await options.scope.close();

    throw new ProviderProcessError(
      error instanceof ProviderProcessError ? error.code : 'START_FAILED',
      error instanceof ProviderProcessError ? error.message : 'Provider process could not start.',
      cleanup,
    );
  }

  const ready = new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', (error) =>
      reject(
        new ProviderProcessError(
          (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'UNAVAILABLE' : 'START_FAILED',
          'Provider process could not start.',
        ),
      ),
    );
  });
  const exited = new Promise<ProcessExit>((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal })),
  );
  // Every stream has an error owner even before a protocol consumer attaches.
  const ignoreStreamError = () => undefined;
  child.stdin!.on('error', ignoreStreamError);
  child.stdout!.on('error', ignoreStreamError);
  child.stderr!.on('error', ignoreStreamError);
  const stderr = (async () => {
    try {
      for await (const chunk of child.stderr!) {
        capture.write('stderr', chunk as Buffer);
      }
    } catch {
      capture.write('stderr', Buffer.from('[diagnostic stream unavailable]\n'));
    }
  })();
  const done = exited.then(async (result) => {
    await stderr;
    capture.finish();

    return result;
  });
  let termination: Promise<ProcessDisposition> | undefined;
  function stopTree() {
    termination ??= (
      windowsJob
        ? windowsJob.stop().finally(() => {
            // A bootstrap can still be loading before job assignment. It cannot dispatch
            // after the job closes; terminate its exact ChildProcess handle as well.
            if (child.exitCode === null) {
              child.kill();
            }
          })
        : terminateOwnedProcess(child)
    ).catch(() => ({ state: 'unknown', reason: 'unverified-tree' }) as const);

    return termination;
  }

  // Cache tree evidence at root exit instead of re-running termination on a long-retained handle.
  // Preserve stdout for the protocol consumer until its explicit disposal.
  child.once('exit', () => {
    void stopTree();
  });
  let disposal:
    | Promise<{
        process: ProcessDisposition;
        cleanup: Awaited<ReturnType<InvocationScope['close']>>;
      }>
    | undefined;
  function dispose() {
    disposal ??= (async () => {
      let processDisposition: ProcessDisposition;
      try {
        processDisposition = await stopTree();
      } catch {
        processDisposition = { state: 'unknown', reason: 'unverified-tree' };
      }

      options.signal.removeEventListener('abort', onAbort);
      child.stdin!.destroy();
      child.stdout!.destroy();
      child.stderr!.destroy();
      if (processDisposition.state === 'unknown') {
        child.unref();
      }

      await stderr;
      capture.finish();
      if (processDisposition.state === 'stopped') {
        await done;
      }

      const cleanup = await options.scope.close(processDisposition.state === 'stopped');

      return { process: processDisposition, cleanup };
    })();

    return disposal;
  }

  function onAbort() {
    void dispose();
  }

  options.signal.addEventListener('abort', onAbort, { once: true });
  if (options.signal.aborted) {
    onAbort();
  }

  try {
    await ready;
    await windowsJob?.ready(child, options.environment.values);
    if (options.signal.aborted) {
      throw new ProviderProcessError('CANCELLED', 'Provider startup was cancelled.');
    }
  } catch (error) {
    const result = await dispose();

    throw new ProviderProcessError(
      error instanceof ProviderProcessError
        ? error.code
        : (error as NodeJS.ErrnoException).code === 'UNAVAILABLE'
          ? 'UNAVAILABLE'
          : 'START_FAILED',
      error instanceof ProviderProcessError ? error.message : 'Provider process could not start.',
      result.cleanup,
    );
  }

  let consumed = false,
    writing = false;

  return {
    done,
    dispose,
    async write(message: string) {
      if (disposal || options.signal.aborted) {
        throw new ProviderProcessError('CANCELLED', 'Provider operation is stopping.');
      }

      if (writing) {
        throw new ProviderProcessError('BUSY', 'Provider input is backpressured.');
      }

      if (Buffer.byteLength(message) > 1024 * 1024) {
        throw new ProviderProcessError('INPUT_INVALID', 'Provider input exceeds its byte budget.');
      }

      writing = true;
      try {
        await new Promise<void>((resolve, reject) =>
          child.stdin!.write(message, (error) =>
            error
              ? reject(
                  new ProviderProcessError(
                    'PROTOCOL_FAILED',
                    'Provider input stream is unavailable.',
                  ),
                )
              : resolve(),
          ),
        );
      } finally {
        writing = false;
      }
    },
    async *lines(): AsyncGenerator<string> {
      if (consumed) {
        throw new ProviderProcessError('BUSY', 'Provider output already has a consumer.');
      }

      consumed = true;
      async function* source() {
        for await (const chunk of child.stdout!) {
          capture.write('stdout', chunk as Buffer);
          yield chunk as Buffer;
        }
      }

      try {
        yield* readProviderLines(source(), options.maxFrameBytes);
      } catch {
        throw new ProviderProcessError(
          'PROTOCOL_FAILED',
          'Provider output violates the bounded transport contract.',
        );
      } finally {
        await dispose();
      }
    },
  };
}
