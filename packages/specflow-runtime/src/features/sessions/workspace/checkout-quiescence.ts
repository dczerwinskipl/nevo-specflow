import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type {
  CheckoutQuiescence,
  CheckoutQuiescenceVerdict,
  SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { SessionsRuntime } from '../feature';
import type {
  SessionStoreOwnerProbe,
  SessionStoreOwnerProbeRequest,
} from '../persistence/owner-probe';

/** The Project's Session store directory (`<Project Home state>/sessions`). */
export function projectSessionStoreDirectory(engine: SpecFlowEngine): string {
  return join(engine.context.project.stateRoot, 'sessions');
}

/** The store's owner record as a non-owner sees it; `absent` when no store was ever created. */
export type SessionStoreOwnership = SessionStoreOwnerProbe | { readonly kind: 'absent' };

/** Reads the owner record in a short-lived Worker (synchronous SQLite stays off this thread). */
export async function inspectSessionStoreOwnership(
  directory: string,
  checkoutRoot: string,
): Promise<SessionStoreOwnership> {
  try {
    await lstat(join(directory, 'sessions.sqlite'));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { kind: 'absent' }
      : { kind: 'unknown', reason: 'the Session store cannot be inspected' };
  }

  const source = import.meta.url.endsWith('.ts')
    ? new URL('../../../session-worker.ts', import.meta.url)
    : new URL('./session-worker.js', import.meta.url);
  const request: SessionStoreOwnerProbeRequest = {
    kind: 'session-store-probe',
    directory,
    checkoutRoot,
  };

  return new Promise((resolve) => {
    const unknown: SessionStoreOwnership = {
      kind: 'unknown',
      reason: 'the Session store owner could not be read',
    };
    let settled = false;
    const settle = (result: SessionStoreOwnership) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const worker = new Worker(source, {
      execArgv: process.execArgv.filter((value) => !value.startsWith('--input-type')),
      workerData: request,
    });
    worker.once('message', (result: SessionStoreOwnerProbe) => settle(result));
    worker.once('error', () => settle(unknown));
    worker.once('exit', () => settle(unknown));
  });
}

/**
 * The answer of a process that does not own the Session store (the CLI, or a Runtime without
 * managed Sessions): agent Sessions run only in the Runtime that owns it, so no Turn can run while
 * no Runtime owns it, except a dead owner's provider whose Turn in the checkout never settled.
 */
export function quiescenceFromOwnership(
  ownership: SessionStoreOwnership,
): CheckoutQuiescenceVerdict {
  switch (ownership.kind) {
    case 'absent':
      return { quiet: true };
    case 'live':
      return {
        quiet: false,
        sessionIds: [],
        message:
          'A SpecFlow Runtime (process ' +
          ownership.pid +
          ') runs agent Sessions for this Project, and one of them may work in this worktree. Close it from the SpecFlow UI, or stop that Runtime and resume this Close.',
      };
    case 'stopped':
      return ownership.unsettledSessionIds.length === 0
        ? { quiet: true }
        : {
            quiet: false,
            sessionIds: ownership.unsettledSessionIds,
            message:
              'An agent Session Turn that a stopped SpecFlow Runtime started in this worktree never settled, so its agent may still run there. Make sure no agent process works in the worktree, start the Runtime to recover the Turn, then close from the SpecFlow UI.',
          };
    case 'unknown':
      return {
        quiet: false,
        sessionIds: [],
        message:
          'Cannot tell whether a SpecFlow Runtime runs agent Sessions for this Project (' +
          ownership.reason +
          '). Close the worktree from the SpecFlow UI, or stop the Runtime and resume this Close.',
      };
  }
}

/** Checkout quiescence of a process that does not own the Project's Session store (the CLI). */
export function sessionStoreCheckoutQuiescence(engine: SpecFlowEngine): CheckoutQuiescence {
  const directory = projectSessionStoreDirectory(engine);

  return async (checkout) =>
    quiescenceFromOwnership(await inspectSessionStoreOwnership(directory, checkout.root));
}

/**
 * Checkout quiescence of the Runtime: while it owns the Session store (managed Sessions run), its
 * own Turns decide; otherwise it is a non-owner like the CLI.
 */
export function runtimeCheckoutQuiescence(options: {
  readonly engine: SpecFlowEngine;
  readonly sessions: SessionsRuntime;
  readonly runningSessions: (workspaceId: string) => readonly string[];
}): CheckoutQuiescence {
  const outsideOwner = sessionStoreCheckoutQuiescence(options.engine);

  return async (checkout) => {
    if (!options.sessions.coordinator) {
      return outsideOwner(checkout);
    }

    const sessionIds = options.runningSessions(checkout.workspaceId);

    return sessionIds.length === 0
      ? { quiet: true }
      : {
          quiet: false,
          sessionIds,
          message:
            'An agent Session is working in this worktree. Wait for its Turn to finish or cancel it, then close.',
        };
  };
}
