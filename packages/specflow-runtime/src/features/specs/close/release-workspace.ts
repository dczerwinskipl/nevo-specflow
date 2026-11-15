import type { PublicCloseSourceWorkspace } from '@nevo/specflow-engine';
import type { CloseRefusalBlocker } from '@nevo/specflow-contracts/specs';

/**
 * Releases what the Runtime holds open in a workspace's checkout (the documentation index), so Close
 * can delete it, notably on Windows; `end` lifts the hold once Close has returned. It refuses with
 * {@link WorkspaceBusyError} while an agent Session Turn works in the checkout, and holds the
 * checkout so no Turn starts there until `end`.
 */
export type ReleaseWorkspace = (workspaceId: string) => Promise<{ end(): void }>;

/** The Sessions whose Turn runs in a workspace now (read-only, for a preview). */
export type RunningSessions = (workspaceId: string) => readonly string[];

/** Close refused: agent Session Turns work in the checkout it would remove. */
export class WorkspaceBusyError extends Error {
  readonly sessionIds: readonly string[];

  constructor(sessionIds: readonly string[]) {
    super('An agent Session works in the worktree.');
    this.sessionIds = sessionIds;
    this.name = 'WorkspaceBusyError';
  }
}

/** The `CLOSE_BLOCKED` blocker of running Session Turns (subjects are Session ids). */
export function sessionTurnBlocker(sessionIds: readonly string[]): CloseRefusalBlocker {
  return {
    kind: 'session-turn-running',
    subjectIds: [...sessionIds],
    message:
      'An agent Session is working in this worktree. Wait for its Turn to finish or cancel it, then close.',
  };
}

/** A preview refuses like the Close itself would while Turns run in the linked checkout. */
export function assertNoRunningTurns(
  running: RunningSessions | undefined,
  source: PublicCloseSourceWorkspace,
): void {
  if (!running || source.kind !== 'linked') {
    return;
  }

  const sessionIds = running(source.workspaceId);
  if (sessionIds.length > 0) {
    throw new WorkspaceBusyError(sessionIds);
  }
}

/**
 * Runs `close` with the plan's source workspace released when it is a linked checkout, the only
 * kind Close removes. The source comes from the immutable Close plan, so a retry after the binding
 * moved to the primary still releases the linked checkout.
 */
export async function whileReleased<T>(
  release: ReleaseWorkspace | undefined,
  source: PublicCloseSourceWorkspace,
  close: () => Promise<T>,
): Promise<T> {
  const held =
    release === undefined || source.kind !== 'linked'
      ? undefined
      : await release(source.workspaceId);
  try {
    return await close();
  } finally {
    held?.end();
  }
}

/** What Close needs from the Runtime's workspace occupancy (the workspaces feature owns it). */
export interface CloseWorkspaceOccupancy {
  holdForClose(
    workspaceId: string,
  ):
    | { readonly kind: 'held'; end(): void }
    | { readonly kind: 'busy'; readonly sessionIds: readonly string[] };
}

/**
 * The release Close runs with: refused while an agent Session Turn works in the checkout, else the
 * checkout is held against new Turns, then whatever else the Runtime holds there is released.
 */
export function releaseAfterQuiescence(
  occupancy: CloseWorkspaceOccupancy,
  release?: ReleaseWorkspace,
): ReleaseWorkspace {
  return async (workspaceId) => {
    const hold = occupancy.holdForClose(workspaceId);
    if (hold.kind === 'busy') {
      throw new WorkspaceBusyError(hold.sessionIds);
    }

    try {
      const released = release ? await release(workspaceId) : undefined;

      return {
        end() {
          released?.end();
          hold.end();
        },
      };
    } catch (error) {
      hold.end();

      throw error;
    }
  };
}
