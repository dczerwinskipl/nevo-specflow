import { readFile, rename, rm, unlink } from 'node:fs/promises';

/**
 * Windows-safe filesystem primitives for persisted Engine state.
 *
 * On Windows a rename/unlink/read can fail transiently with EPERM, EBUSY or EACCES while another
 * handle (a concurrent inspection read, antivirus, the search indexer) is open on the target. The
 * condition clears within milliseconds, so a bounded retry with backoff is correct there. On POSIX
 * these codes are real, immediate failures and the operations are executed exactly once.
 */
export const TRANSIENT_FS_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** Directory operations additionally race with a not-yet-released child handle. */
export const TRANSIENT_DIRECTORY_FS_CODES: ReadonlySet<string> = new Set([
  ...TRANSIENT_FS_CODES,
  'EEXIST',
  'ENOTEMPTY',
]);

export interface TransientRetryOptions {
  /** Total attempts including the first. Default 12 (about 3 s of backoff on Windows). */
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly codes?: ReadonlySet<string>;
  /** Retries only apply on Windows by default; injectable for tests. */
  readonly platform?: NodeJS.Platform;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `action`, retrying transient Windows lock errors with bounded exponential backoff. */
export async function retryTransientFs<T>(
  action: () => Promise<T>,
  options: TransientRetryOptions = {},
): Promise<T> {
  const platform = options.platform ?? process.platform;
  const attempts = platform === 'win32' ? Math.max(1, options.attempts ?? 12) : 1;
  const base = options.baseDelayMs ?? 10;
  const cap = options.maxDelayMs ?? 400;
  const codes = options.codes ?? TRANSIENT_FS_CODES;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= attempts || !hasCode(error, codes)) {
        throw error;
      }

      await sleep(Math.min(cap, base * 2 ** (attempt - 1)));
    }
  }
}

export interface RenameOperations {
  readonly rename: (from: string, to: string) => Promise<void>;
}

export function renameWindowsSafe(
  from: string,
  to: string,
  options: TransientRetryOptions & {
    readonly fs?: RenameOperations;
    readonly directory?: boolean;
  } = {},
): Promise<void> {
  const operations = options.fs ?? { rename };

  return retryTransientFs(() => operations.rename(from, to), {
    ...options,
    codes: options.codes ?? (options.directory ? TRANSIENT_DIRECTORY_FS_CODES : TRANSIENT_FS_CODES),
  });
}

export function removeFileWindowsSafe(
  path: string,
  options: TransientRetryOptions & {
    readonly fs?: { readonly rm: (path: string, options: { force: boolean }) => Promise<void> };
  } = {},
): Promise<void> {
  const operations = options.fs ?? { rm };

  return retryTransientFs(() => operations.rm(path, { force: true }), options);
}

export function unlinkWindowsSafe(
  path: string,
  options: TransientRetryOptions & {
    readonly fs?: { readonly unlink: (path: string) => Promise<void> };
  } = {},
): Promise<void> {
  const operations = options.fs ?? { unlink };

  return retryTransientFs(() => operations.unlink(path), options);
}

/** Reads a state file that a writer may be replacing right now. */
export function readFileWindowsSafe(
  path: string,
  options: TransientRetryOptions & {
    readonly fs?: { readonly readFile: (path: string, encoding: 'utf8') => Promise<string> };
  } = {},
): Promise<string> {
  const operations = options.fs ?? { readFile };

  return retryTransientFs(() => operations.readFile(path, 'utf8'), options);
}

function hasCode(error: unknown, codes: ReadonlySet<string>): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    codes.has((error as { code: string }).code)
  );
}
