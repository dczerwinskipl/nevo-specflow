import type { WorkspaceList } from '@nevo/specflow-contracts/workspaces';

/**
 * What set the tab's current workspace:
 * - `project-folder`: nothing yet (a new tab), or the fallback;
 * - `remembered`: restored from this tab's session storage after a reload;
 * - `specification`: entering a Specification (its bound workspace);
 * - `pick`: an explicit pick in the reader's workspace picker;
 * - `route`: a `/workspaces/:workspaceId/docs…` address;
 * - `session`: a Session's Context entry (the Runtime's own checkout).
 */
export type CurrentWorkspaceSource =
  'project-folder' | 'remembered' | 'specification' | 'pick' | 'route' | 'session';

/**
 * Why the reader shows the project folder instead of the workspace it was asked for: the quiet
 * line under the picker. `unavailable` names the workspace (its folder cannot be read now).
 */
export type WorkspaceFallbackNotice =
  | { readonly reason: 'not-registered' }
  | { readonly reason: 'unavailable'; readonly workspaceName: string };

export interface CurrentWorkspaceState {
  /** Absent until something sets it: the project folder (or, for `session`, the Runtime's checkout). */
  readonly workspaceId?: string;
  readonly source: CurrentWorkspaceSource;
  readonly notice?: WorkspaceFallbackNotice;
}

export const initialCurrentWorkspace: CurrentWorkspaceState = { source: 'project-folder' };

const noticeKey = (notice: WorkspaceFallbackNotice | undefined) =>
  notice?.reason === 'unavailable' ? `unavailable:${notice.workspaceName}` : (notice?.reason ?? '');

export function sameCurrentWorkspace(a: CurrentWorkspaceState, b: CurrentWorkspaceState): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.source === b.source &&
    noticeKey(a.notice) === noticeKey(b.notice)
  );
}

/**
 * Sets the current workspace. The same workspace again keeps the state (and its notice) when the
 * address merely follows it: a route that names the workspace already current, for example after
 * the reader replaced `/docs` or redirected a fallback, is not a new choice. A Specification, a
 * pick or a Session entry of the same workspace records the new source and clears the notice.
 */
export function chooseWorkspace(
  state: CurrentWorkspaceState,
  workspaceId: string | undefined,
  source: CurrentWorkspaceSource,
): CurrentWorkspaceState {
  if (workspaceId !== undefined && workspaceId === state.workspaceId) {
    return source === 'route' || source === state.source ? state : { workspaceId, source };
  }

  return workspaceId === undefined ? { source } : { workspaceId, source };
}

/**
 * The workspace the reader shows for `state`, given the registered workspaces. Unset, it is the
 * project folder (a Session entry: the Runtime's own checkout). A workspace no longer registered
 * falls back to the project folder; so does one that is unavailable, except right after an explicit
 * pick, which the reader answers with its own alert. Returns `state` itself when nothing changes.
 */
export function settleCurrentWorkspace(
  state: CurrentWorkspaceState,
  list: WorkspaceList,
): CurrentWorkspaceState {
  const projectFolder: CurrentWorkspaceState = {
    workspaceId: list.projectFolderId,
    source: 'project-folder',
  };

  if (state.workspaceId === undefined) {
    if (state.source === 'session') {
      const runtime = list.workspaces.find((workspace) => workspace.isRuntimeWorkspace);

      return { workspaceId: runtime?.workspaceId ?? list.projectFolderId, source: 'session' };
    }

    return projectFolder;
  }

  if (state.workspaceId === list.projectFolderId) {
    return state;
  }

  const workspace = list.workspaces.find((item) => item.workspaceId === state.workspaceId);
  if (!workspace) {
    return { ...projectFolder, notice: { reason: 'not-registered' } };
  }

  if (!workspace.available && state.source !== 'pick') {
    return { ...projectFolder, notice: { reason: 'unavailable', workspaceName: workspace.name } };
  }

  return state;
}
