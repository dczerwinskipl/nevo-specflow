import {
  chooseWorkspace,
  initialCurrentWorkspace,
  sameCurrentWorkspace,
  type CurrentWorkspaceSource,
  type CurrentWorkspaceState,
} from './currentWorkspace';

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The tab's current documentation workspace: one value per browser tab, kept across reloads in
 * session storage and never shared between tabs (two tabs may read two worktrees). The fallback
 * notice is not stored: a reload shows the documentation without it.
 */
export interface CurrentWorkspaceStore {
  readonly get: () => CurrentWorkspaceState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Writes a settled state (the reader's fallback); an equal state changes nothing. */
  readonly replace: (next: CurrentWorkspaceState) => void;
  /** Entering a Specification: its bound workspace (the workspace response's `workspaceId`). */
  readonly enterSpecification: (workspaceId: string) => void;
  /** An explicit pick in the workspace picker. */
  readonly pick: (workspaceId: string) => void;
  /** Opening a `/workspaces/:workspaceId/docs…` address: an explicit address is an explicit choice. */
  readonly openRoute: (workspaceId: string) => void;
  /** A Session's Context entry: the Runtime's own checkout, resolved from the workspace list. */
  readonly enterSession: () => void;
}

const storageKey = 'specflow.docs.current-workspace.v1';

const storedSources: readonly CurrentWorkspaceSource[] = [
  'project-folder',
  'remembered',
  'specification',
  'pick',
  'route',
  'session',
];

/** A damaged or foreign entry is ignored: the tab starts at the project folder. */
function load(storage: SessionStore | undefined): CurrentWorkspaceState {
  try {
    const raw = storage?.getItem(storageKey);
    const value: unknown = raw ? JSON.parse(raw) : undefined;
    if (typeof value !== 'object' || value === null) {
      return initialCurrentWorkspace;
    }

    const { workspaceId, source } = value as Record<string, unknown>;
    if (!storedSources.includes(source as CurrentWorkspaceSource)) {
      return initialCurrentWorkspace;
    }

    // A pick is explicit only while it is being made; after a reload it is a remembered value,
    // which falls back like any other when its workspace is unavailable.
    const restored = source === 'pick' ? 'remembered' : (source as CurrentWorkspaceSource);

    return typeof workspaceId === 'string' && workspaceId.length > 0
      ? { workspaceId, source: restored }
      : { source: restored };
  } catch {
    return initialCurrentWorkspace;
  }
}

function save(storage: SessionStore | undefined, state: CurrentWorkspaceState): void {
  try {
    storage?.setItem(
      storageKey,
      JSON.stringify({ workspaceId: state.workspaceId, source: state.source }),
    );
  } catch {
    // Storage full or blocked: the value still holds for this page.
  }
}

const browserSessionStorage = (): SessionStore | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
};

export function createCurrentWorkspaceStore(
  storage: SessionStore | undefined = browserSessionStorage(),
): CurrentWorkspaceStore {
  let state = load(storage);
  const listeners = new Set<() => void>();

  const replace = (next: CurrentWorkspaceState) => {
    if (sameCurrentWorkspace(state, next)) {
      return;
    }

    state = next;
    save(storage, state);
    listeners.forEach((listener) => listener());
  };

  const choose = (workspaceId: string | undefined, source: CurrentWorkspaceSource) =>
    replace(chooseWorkspace(state, workspaceId, source));

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => void listeners.delete(listener);
    },
    replace,
    enterSpecification: (workspaceId) => choose(workspaceId, 'specification'),
    pick: (workspaceId) => choose(workspaceId, 'pick'),
    openRoute: (workspaceId) => choose(workspaceId, 'route'),
    enterSession: () => choose(undefined, 'session'),
  };
}

/** The store of this browser tab. */
export const currentDocsWorkspace: CurrentWorkspaceStore = createCurrentWorkspaceStore();
