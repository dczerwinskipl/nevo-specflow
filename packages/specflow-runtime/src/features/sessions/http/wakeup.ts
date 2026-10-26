/** A commit between an outbox read and sleeping must not be missed. No payloads are retained. */
export function createStreamWakeup(subscribe: (listener: () => void) => () => void) {
  let revision = 0;
  let wake: (() => void) | undefined;
  const unsubscribe = subscribe(() => {
    revision++;
    wake?.();
  });
  return {
    revision: () => revision,
    async wait(observed: number, signal: AbortSignal, timeoutMs: number) {
      if (observed !== revision || signal.aborted) return;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', finish);
          wake = undefined;
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        timer.unref();
        wake = finish;
        signal.addEventListener('abort', finish, { once: true });
        if (observed !== revision || signal.aborted) finish();
      });
    },
    close() {
      unsubscribe();
      wake?.();
    },
  };
}
