/**
 * What runs in a workspace's checkout right now, in this Runtime process: the Session Turns whose
 * agent has it as its working folder, and a Close that is about to remove it. Close must not remove
 * a checkout an agent works in (Windows refuses, Linux deletes the agent's folder), and no Turn may
 * start in a checkout Close is removing. Both sides decide synchronously here, so the check and the
 * mark are one step and cannot interleave.
 *
 * In-process only: a Close run by another process (the CLI) is seen through the Engine's durable
 * Close journal, which a Turn start also checks.
 */
export interface WorkspaceOccupancy {
  /** Registers a Turn in the workspace; `undefined` while a Close holds it. */
  beginTurn(workspaceId: string, sessionId: string): { end(): void } | undefined;
  /** The Sessions whose Turn runs in the workspace now, in start order. */
  runningSessions(workspaceId: string): readonly string[];
  /** Holds the workspace for a Close, unless a Turn runs there: then those Sessions are returned. */
  holdForClose(
    workspaceId: string,
  ):
    | { readonly kind: 'held'; end(): void }
    | { readonly kind: 'busy'; readonly sessionIds: readonly string[] };
}

export function createWorkspaceOccupancy(): WorkspaceOccupancy {
  const turns = new Map<string, Map<symbol, string>>();
  const closing = new Map<string, number>();

  const running = (workspaceId: string) => [...(turns.get(workspaceId)?.values() ?? [])];

  return {
    beginTurn(workspaceId, sessionId) {
      if ((closing.get(workspaceId) ?? 0) > 0) {
        return undefined;
      }

      const token = Symbol(sessionId);
      const entries = turns.get(workspaceId) ?? new Map<symbol, string>();
      entries.set(token, sessionId);
      turns.set(workspaceId, entries);
      let ended = false;

      return {
        end() {
          if (ended) {
            return;
          }

          ended = true;
          entries.delete(token);
          if (entries.size === 0 && turns.get(workspaceId) === entries) {
            turns.delete(workspaceId);
          }
        },
      };
    },
    runningSessions: (workspaceId) => [...new Set(running(workspaceId))],
    holdForClose(workspaceId) {
      const sessionIds = [...new Set(running(workspaceId))];
      if (sessionIds.length > 0) {
        return { kind: 'busy', sessionIds };
      }

      closing.set(workspaceId, (closing.get(workspaceId) ?? 0) + 1);
      let ended = false;

      return {
        kind: 'held',
        end() {
          if (ended) {
            return;
          }

          ended = true;
          const count = (closing.get(workspaceId) ?? 1) - 1;
          if (count > 0) {
            closing.set(workspaceId, count);
          } else {
            closing.delete(workspaceId);
          }
        },
      };
    },
  };
}
