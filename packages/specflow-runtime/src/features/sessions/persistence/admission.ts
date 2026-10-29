import { SessionError } from '../errors';

const READ_CAPACITY = 48;
const TOTAL_CAPACITY = 64;
const WAITING_CAPACITY = 64;
const ADMISSION_TIMEOUT_MS = 5000;

/** Reserve Worker capacity for ordered provider facts without an unbounded retry queue. */
export function createStoreAdmission() {
  interface Waiter {
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
  let running = 0;
  let failure: Error | undefined;
  const waiting: Waiter[] = [];

  function reserve(): () => void {
    running++;
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      running--;
      const next = waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(reserve());
      }
    };
  }

  return {
    acquire(critical: boolean): Promise<() => void> {
      if (failure) {
        return Promise.reject(failure);
      }

      if (running < (critical ? TOTAL_CAPACITY : READ_CAPACITY)) {
        return Promise.resolve(reserve());
      }

      if (!critical || waiting.length >= WAITING_CAPACITY) {
        return Promise.reject(
          new SessionError('SESSION_STORE_BUSY', 'Session storage queue is full.'),
        );
      }

      return new Promise((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            const index = waiting.indexOf(waiter);
            if (index !== -1) {
              waiting.splice(index, 1);
            }

            reject(
              new SessionError('SESSION_STORE_BUSY', 'Lifecycle storage admission timed out.'),
            );
          }, ADMISSION_TIMEOUT_MS),
        };
        waiter.timer.unref();
        waiting.push(waiter);
      });
    },
    fail(error: Error) {
      failure = error;
      for (const waiter of waiting.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    },
  };
}
