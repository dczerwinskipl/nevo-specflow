/**
 * The timers the scheduler and the flush use, as a seam: production uses the Node timers, tests
 * drive a fake. A handle is opaque to the caller.
 */
export interface QueueTimers {
  /** Calls `fn` once after `ms`. An `unref`'d timer never keeps the process alive. */
  set(fn: () => void, ms: number, options?: { readonly unref?: boolean }): unknown;
  clear(handle: unknown): void;
}

export const systemQueueTimers: QueueTimers = {
  set: (fn, ms, options) => {
    const handle = setTimeout(fn, ms);
    if (options?.unref === true) handle.unref();
    return handle;
  },
  clear: (handle) => {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

export type DeadlineOutcome<T> =
  { readonly kind: 'done'; readonly value: T } | { readonly kind: 'deadline' };

/**
 * Waits for `work` for at most `ms`. When the deadline wins, `work` keeps running (a Git commit
 * cannot be cancelled) and its eventual failure is swallowed here: the caller no longer waits for it.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  timers: QueueTimers,
): Promise<DeadlineOutcome<T>> {
  let handle: unknown;
  const deadline = new Promise<DeadlineOutcome<T>>((resolve) => {
    handle = timers.set(
      () => {
        resolve({ kind: 'deadline' });
      },
      Math.max(0, ms),
    );
  });
  try {
    return await Promise.race([
      work.then((value): DeadlineOutcome<T> => ({ kind: 'done', value })),
      deadline,
    ]);
  } finally {
    timers.clear(handle);
    work.catch(() => undefined);
  }
}
