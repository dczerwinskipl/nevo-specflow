import { useEffect, useState } from 'react';
import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';

/** The Specification's uncommitted changes as the route composition reads them. */
export interface WorkspaceChangesSource {
  /** Uncommitted files in the Specification's workspace, as last read. */
  readonly count: number;
  /** Reads them again; resolves `true` once a new count is in, `false` when the read failed. */
  readonly refresh: () => Promise<boolean>;
}

/** What a Turn's outcome may say about the workspace now. */
export interface WorkspaceChangesNow {
  /** The count read after the last Turn ended; absent while that is not known. */
  readonly count?: number;
  /** Review workspace changes can show something (or may: the count is not known yet). */
  readonly reviewable: boolean;
}

/** The last Turn that ended, by its `outcome` entry: a new one means the workspace may differ. */
function lastOutcomeOf(snapshot: SessionSnapshot | undefined): string {
  const entries = snapshot?.entries ?? [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]!.kind === 'outcome') {
      return entries[index]!.id;
    }
  }

  return '';
}

/**
 * The Specification's uncommitted files as a Turn's outcome may state them (full-session.md "Turn
 * outcome"): only a count read after the last Turn ended, while no Turn runs. Each Turn end reads
 * the workspace again; until that read is in (or while a Turn runs and may still change files),
 * the count is unknown, so the outcome says changes "may" have been made and keeps Review
 * workspace changes. A cached count from before the Turn's last writes is never stated as fact.
 */
export function useWorkspaceChangesAfterTurn(
  snapshot: SessionSnapshot | undefined,
  source: WorkspaceChangesSource | undefined,
): WorkspaceChangesNow | undefined {
  const lastOutcome = lastOutcomeOf(snapshot);
  const refresh = source?.refresh;
  // The last Turn end a completed read is known to follow.
  const [readAfter, setReadAfter] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!refresh) {
      return;
    }

    let current = true;
    // A failed read leaves the earlier count stale: it is never stated as the workspace's state.
    void refresh().then((read) => {
      if (current && read) {
        setReadAfter(lastOutcome);
      }
    });

    return () => {
      current = false;
    };
  }, [refresh, lastOutcome]);

  if (!source) {
    return undefined;
  }

  const running = snapshot?.activeTurn !== undefined;
  const fresh = !running && readAfter === lastOutcome;

  return fresh ? { count: source.count, reviewable: source.count > 0 } : { reviewable: true };
}
