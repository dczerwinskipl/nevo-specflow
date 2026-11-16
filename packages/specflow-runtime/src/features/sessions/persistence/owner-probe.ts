import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

import { UNSETTLED_CHECKOUT_TURNS_SQL } from './checkout-turns';

/**
 * What the Session store's durable owner record says, read by a process that does not own the
 * store. `live`: a Runtime owns it now. `stopped`: no Runtime owns it, with the Sessions whose
 * native Turn in the checkout never settled (a dead owner's provider may still run there).
 * `unknown`: the record cannot be read or its owner cannot be proven stopped.
 */
export type SessionStoreOwnerProbe =
  | { readonly kind: 'live'; readonly pid: number }
  | { readonly kind: 'stopped'; readonly unsettledSessionIds: readonly string[] }
  | { readonly kind: 'unknown'; readonly reason: string };

export interface SessionStoreOwnerProbeRequest {
  readonly kind: 'session-store-probe';
  readonly directory: string;
  /** The checkout whose unsettled native Turns are reported. */
  readonly checkoutRoot: string;
}

/**
 * Reads the owner row, then the checkout's unsettled native Turns, from a read-only connection. A
 * Runtime that takes ownership between the two reads cannot start a Turn in the checkout: it sees
 * the unfinished Close journal first. Like the store's own acquisition, only `ESRCH` proves the recorded owner
 * stopped; any other answer of the process probe leaves it unknown. Runs in a Worker: synchronous
 * SQLite stays off the caller's event loop.
 */
export function probeSessionStoreOwner(
  request: SessionStoreOwnerProbeRequest,
  processAlive: (pid: number) => 'alive' | 'stopped' | 'unknown' = probeProcess,
): SessionStoreOwnerProbe {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(join(request.directory, 'sessions.sqlite'), { readOnly: true });
  } catch {
    return { kind: 'unknown', reason: 'the Session store cannot be opened' };
  }

  try {
    db.exec('PRAGMA busy_timeout=1000');
    const owner = db.prepare('SELECT runtime,pid FROM owner WHERE id=1').get() as
      { runtime: string; pid: number } | undefined;
    if (owner?.runtime) {
      const pid = Number(owner.pid);
      const state = processAlive(pid);
      if (state === 'alive') {
        return { kind: 'live', pid };
      }

      if (state === 'unknown') {
        return { kind: 'unknown', reason: 'its owning Runtime process cannot be inspected' };
      }
    }

    const rows = db.prepare(UNSETTLED_CHECKOUT_TURNS_SQL).all(request.checkoutRoot) as {
      session: string;
    }[];

    return { kind: 'stopped', unsettledSessionIds: rows.map((row) => String(row.session)) };
  } catch {
    return { kind: 'unknown', reason: 'the Session store cannot be read' };
  } finally {
    db.close();
  }
}

function probeProcess(pid: number): 'alive' | 'stopped' | 'unknown' {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return 'unknown';
  }

  try {
    process.kill(pid, 0);

    return 'alive';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'stopped' : 'unknown';
  }
}

if (
  !isMainThread &&
  (workerData as { kind?: string } | undefined)?.kind === 'session-store-probe'
) {
  parentPort?.postMessage(probeSessionStoreOwner(workerData as SessionStoreOwnerProbeRequest));
}
