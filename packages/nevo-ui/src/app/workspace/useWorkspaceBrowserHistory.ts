import { useEffect, useLayoutEffect, useRef } from 'react';

import { createWorkspaceHistorySync, type WorkspaceHistorySync } from './workspaceBrowserHistory';

interface WorkspaceBrowserHistoryOptions {
  /** `AppWorkspaceProvider`'s `browserHistory` opt-in. */
  enabled: boolean;
  /** The rendered desired depth; only used to trigger a reconcile after each commit. */
  depth: number;
  /** Synchronous read of the desired depth from the provider's own source of truth. */
  getDepth: () => number;
  back: () => Promise<boolean>;
}

/**
 * Wires `createWorkspaceHistorySync` to one `AppWorkspaceProvider`. Inert when disabled, without
 * `window` (SSR), or when another provider on the page already owns browser history.
 */
export function useWorkspaceBrowserHistory({
  enabled,
  depth,
  getDepth,
  back,
}: WorkspaceBrowserHistoryOptions) {
  const syncRef = useRef<WorkspaceHistorySync | null>(null);
  const latest = useRef({ getDepth, back });

  useLayoutEffect(() => {
    latest.current = { getDepth, back };
  }, [getDepth, back]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const sync = createWorkspaceHistorySync(window, {
      getDepth: () => latest.current.getDepth(),
      back: () => latest.current.back(),
    });
    syncRef.current = sync;
    sync?.reconcile();

    return () => {
      sync?.dispose();
      if (syncRef.current === sync) {
        syncRef.current = null;
      }
    };
  }, [enabled]);

  useEffect(() => {
    syncRef.current?.reconcile();
  }, [depth]);
}
