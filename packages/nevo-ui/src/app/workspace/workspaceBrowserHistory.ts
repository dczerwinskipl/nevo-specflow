/**
 * Browser-history mirror of the Secondary runtime's own Back (opt-in, see
 * `AppWorkspaceProvider`'s `browserHistory` prop and
 * `docs/design-system/implementation/react/secondary-navigation.md`, "Browser and system Back").
 *
 * Invariant: the number of same-URL history entries this controller owns above the entry the page
 * was on ("committed depth") equals the number of workspace `back()` calls needed to hide the
 * Secondary ("desired depth" — the active runtime tab's stack length while the region is visible,
 * else 0). Every browser Back therefore performs exactly one workspace `back()`, and every UI Back
 * consumes exactly one entry, so the stack never holds stale entries.
 *
 * Coexistence with an application router that owns the URL (TanStack Router):
 * - the URL is never changed: entries are pushed without a URL argument;
 * - the router's own `history.state` keys (`__TSR_index`, `__TSR_key`, `key`) are copied into
 *   every pushed entry, so its index-delta arithmetic on popstate sees `0` (a same-href "GO"
 *   that re-matches the same route without remounting anything);
 * - entries are pushed through the unpatched `History.prototype.pushState`, so a router that
 *   monkey-patches `history.pushState` to observe pushes is not notified of a push it did not make;
 * - `history.go(-n)` is only ever issued while this controller's own entry at the committed depth
 *   is the current one, so a traversal can never leave the document or undo a router navigation.
 */

export const WORKSPACE_HISTORY_STATE_KEY = '__nevoWorkspaceHistory';

/** How long to wait for the `popstate` of our own `history.go` before assuming it was dropped. */
const TRAVERSAL_FALLBACK_MS = 1000;

interface WorkspaceHistoryMarker {
  owner: string;
  depth: number;
}

export interface WorkspaceHistorySyncOptions {
  /** The current desired depth, read synchronously from the workspace's source of truth. */
  getDepth: () => number;
  /** The workspace's own Back. Resolves `false` when a leave guard refuses. */
  back: () => Promise<boolean>;
}

export interface WorkspaceHistorySync {
  /** Brings the browser entries in line with `getDepth()`. Idempotent. */
  reconcile: () => void;
  /** Stops listening. Never traverses: our entries may no longer be on top (see the doc note). */
  dispose: () => void;
}

/**
 * One `history.go` issued by a controller is in flight. Module-level (not per controller) so its
 * `popstate` is still recognised as ours when the issuing controller unmounted meanwhile and a
 * new one mounted (story switches, route remounts).
 */
let pendingTraversal: { timer: ReturnType<typeof setTimeout> } | null = null;
const traversalEvents = new WeakSet<Event>();
/** Only one provider may own browser history at a time. */
let activeSync: { reconcile: () => void } | null = null;
let ownerSequence = 0;

function createOwnerId() {
  ownerSequence += 1;

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${ownerSequence}`;
}

function readMarker(win: Window): WorkspaceHistoryMarker | null {
  const state: unknown = win.history.state;
  if (!state || typeof state !== 'object') {
    return null;
  }

  const marker = (state as Record<string, unknown>)[WORKSPACE_HISTORY_STATE_KEY];
  if (!marker || typeof marker !== 'object') {
    return null;
  }

  const { owner, depth } = marker as Partial<WorkspaceHistoryMarker>;

  return typeof owner === 'string' && typeof depth === 'number' ? { owner, depth } : null;
}

type PushState = (this: History, data: unknown, unused: string) => void;

function nativePushState(win: Window): (state: unknown) => void {
  // The prototype method, not the instance property a router may have monkey-patched.
  const prototype: unknown = Object.getPrototypeOf(win.history);
  const native: unknown = prototype ? Reflect.get(prototype, 'pushState') : undefined;
  const push: PushState =
    typeof native === 'function'
      ? (native as PushState)
      : (data, unused) => win.history.pushState(data, unused);

  // No URL argument: the entry keeps the current URL exactly.
  return (state) => Reflect.apply(push, win.history, [state, '']);
}

/** Every caller is gated on `pendingTraversal`, so at most one traversal is ever in flight. */
function traverse(win: Window, delta: number) {
  if (pendingTraversal) {
    return;
  }

  const finish = () => {
    if (!pendingTraversal) {
      return;
    }

    clearTimeout(pendingTraversal.timer);
    win.removeEventListener('popstate', onTraversalPopState);
    pendingTraversal = null;
    activeSync?.reconcile();
  };

  const onTraversalPopState = (event: Event) => {
    traversalEvents.add(event);
    finish();
  };

  win.addEventListener('popstate', onTraversalPopState);
  pendingTraversal = { timer: setTimeout(finish, TRAVERSAL_FALLBACK_MS) };

  win.history.go(delta);
}

/**
 * Starts mirroring. Returns `null` when another provider already owns browser history (only the
 * first enabled `AppWorkspaceProvider` on a page does; later ones stay purely in-memory).
 */
export function createWorkspaceHistorySync(
  win: Window,
  { getDepth, back }: WorkspaceHistorySyncOptions,
): WorkspaceHistorySync | null {
  if (activeSync) {
    return null;
  }

  const owner = createOwnerId();
  const pushState = nativePushState(win);
  let committed = 0;
  let pendingBacks = 0;
  let draining = false;
  let disposed = false;

  const isOwnTop = () => {
    const marker = readMarker(win);

    return marker?.owner === owner && marker.depth === committed;
  };

  const reconcile = () => {
    if (disposed || draining || pendingTraversal) {
      return;
    }

    // Someone else's entry (a router navigation, a router `replace` that dropped our marker) is
    // current: our older entries are unreachable without undoing it. Re-base on top of it.
    if (committed > 0 && !isOwnTop()) {
      committed = 0;
    }

    const desired = Math.max(0, getDepth());
    if (desired > committed) {
      const base: unknown = win.history.state;
      const preserved = base && typeof base === 'object' ? (base as Record<string, unknown>) : {};
      for (let depth = committed + 1; depth <= desired; depth += 1) {
        pushState({ ...preserved, [WORKSPACE_HISTORY_STATE_KEY]: { owner, depth } });
      }

      committed = desired;
    } else if (desired < committed) {
      const delta = desired - committed;
      committed = desired;
      traverse(win, delta);
    }
  };

  const drain = async () => {
    draining = true;
    try {
      while (pendingBacks > 0 && !disposed) {
        pendingBacks -= 1;
        if (!(await back())) {
          // A leave guard refused: stop; `reconcile` below re-pushes the entry the browser popped.
          pendingBacks = 0;
        }
      }
    } finally {
      draining = false;
      reconcile();
    }
  };

  const requestBacks = (count: number) => {
    pendingBacks += count;
    if (!draining) {
      void drain();
    }
  };

  const onPopState = (event: Event) => {
    if (disposed || pendingTraversal || traversalEvents.has(event)) {
      return; // The popstate of our own `history.go`, handled by `traverse`.
    }

    const marker = readMarker(win);
    if (marker?.owner === owner) {
      if (marker.depth < committed) {
        const steps = committed - marker.depth;
        committed = marker.depth;
        requestBacks(steps);
      } else if (marker.depth > committed) {
        // Browser Forward onto an entry a previous Back already consumed: the workspace cannot
        // redo it, so the entry is neutralised by stepping straight back to the committed depth.
        traverse(win, committed - marker.depth);
      }

      return;
    }

    if (committed > 0) {
      // Back past our first entry (onto the base entry, or anything below it): hide the region.
      const steps = committed;
      committed = 0;
      requestBacks(steps);

      return;
    }

    if (marker && marker.depth > 0) {
      // An orphan from an earlier provider instance (reload, remount, route return): it maps to
      // no workspace state, so skip it rather than let one browser Back "do nothing".
      traverse(win, -marker.depth);
    }
  };

  const sync: WorkspaceHistorySync = {
    reconcile,
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      win.removeEventListener('popstate', onPopState);
      if (activeSync === sync) {
        activeSync = null;
      }
    },
  };

  activeSync = sync;
  win.addEventListener('popstate', onPopState);

  return sync;
}
