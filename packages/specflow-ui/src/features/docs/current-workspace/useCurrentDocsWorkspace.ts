import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import { useWorkspaces } from '../../workspaces/read-model';
import { leaveDocsWorkspace } from '../read-model';
import {
  chooseWorkspace,
  sameCurrentWorkspace,
  settleCurrentWorkspace,
  type CurrentWorkspaceSource,
  type WorkspaceFallbackNotice,
} from './currentWorkspace';
import { currentDocsWorkspace, type CurrentWorkspaceStore } from './currentWorkspaceStore';

export interface UseCurrentDocsWorkspaceOptions {
  /** The `:workspaceId` of a `/workspaces/:workspaceId/docs…` route; absent on `/docs`. */
  readonly routeWorkspaceId?: string;
  /**
   * What led to the route, carried with the navigation (location state): `pick` for the picker's
   * navigation, `session` for the Session entry. Default `route`, an address opened as such. The
   * store and the route change in two commits (the router navigates in a transition), so a render
   * between them sees the new store value with the old route; the route's own source makes the
   * route's commit restore the intent instead of losing it.
   */
  readonly routeSource?: Extract<CurrentWorkspaceSource, 'route' | 'pick' | 'session'>;
  /** For tests; the tab's store otherwise. */
  readonly store?: CurrentWorkspaceStore;
}

export interface CurrentDocsWorkspace {
  /** The workspace whose documentation the reader shows; absent until the workspace list is read. */
  readonly workspaceId?: string;
  /** Its entry of the workspace list (for the picker, `isRuntimeWorkspace`, availability). */
  readonly workspace?: WorkspaceListItem;
  readonly source?: CurrentWorkspaceSource;
  /** The quiet line under the picker when the reader fell back to the project folder. */
  readonly notice?: WorkspaceFallbackNotice;
  /**
   * The workspace the address should name when it differs from the route (`/docs`, or a fallback
   * from a gone or unavailable workspace): the reader replaces the route with it.
   */
  readonly redirectTo?: string;
  /** The shared workspace list (loading and failure states of the reader). */
  readonly workspaces: UseQueryResult<WorkspaceList>;
}

/**
 * The reader's current workspace: the route's workspace when there is one (an explicit choice),
 * otherwise the tab's current workspace, settled against the registered workspaces (fallback to the
 * project folder). It writes the route choice and the fallback to the tab's store, and when the
 * workspace changes it cancels and drops the previous workspace's documentation reads.
 */
export function useCurrentDocsWorkspace(
  options: UseCurrentDocsWorkspaceOptions = {},
): CurrentDocsWorkspace {
  const { routeWorkspaceId, routeSource = 'route', store = currentDocsWorkspace } = options;
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const workspaces = useWorkspaces();
  const queryClient = useQueryClient();

  const requested =
    routeWorkspaceId === undefined ? state : chooseWorkspace(state, routeWorkspaceId, routeSource);
  const settled = workspaces.data ? settleCurrentWorkspace(requested, workspaces.data) : undefined;

  // The store is the tab's memory (session storage): it follows the route and the fallback.
  useEffect(() => {
    if (settled && !sameCurrentWorkspace(settled, state)) {
      store.replace(settled);
    }
  }, [settled, state, store]);

  // Bookkeeping of the previous workspace only (no UI state): written in the effect, never in render.
  const previousWorkspace = useRef<string | undefined>(undefined);
  const workspaceId = settled?.workspaceId;
  useEffect(() => {
    const previous = previousWorkspace.current;
    previousWorkspace.current = workspaceId;
    if (previous !== undefined && previous !== workspaceId) {
      leaveDocsWorkspace(queryClient, previous);
    }
  }, [queryClient, workspaceId]);

  if (!settled || !workspaces.data) {
    return { workspaces };
  }

  return {
    workspaceId: settled.workspaceId,
    workspace: workspaces.data.workspaces.find((item) => item.workspaceId === settled.workspaceId),
    source: settled.source,
    notice: settled.notice,
    redirectTo: settled.workspaceId !== routeWorkspaceId ? settled.workspaceId : undefined,
    workspaces,
  };
}
