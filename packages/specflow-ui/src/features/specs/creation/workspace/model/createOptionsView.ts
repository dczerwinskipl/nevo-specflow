import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';

/**
 * One workspace of the Create section: the Create facts of the options (`CreateOptions`, with
 * `specCount` of every bound Specification) joined by `workspaceId` with the registry facts and
 * the titles of the shared workspace list (`GET /api/workspaces`). `specifications` lists only the
 * readable and viewable ones, so it can be shorter than `specCount`.
 */
export type CreateWorkspace = CreateOptions['workspaces'][number] &
  Pick<WorkspaceListItem, 'kind' | 'name' | 'path' | 'specifications'>;

/** The Create options with every workspace joined to its list row. */
export type CreateOptionsView = Omit<CreateOptions, 'workspaces'> & {
  workspaces: CreateWorkspace[];
};

/**
 * Joins the two snapshots. A workspace of the options without a row in the list means the
 * registry changed between the two reads, so the pair is not coherent: nothing is joined and the
 * caller treats it as a failed read (error state, Retry reads both again). A list row without Create facts is not offered by Create and is ignored.
 */
export function joinCreateOptions(
  options: CreateOptions,
  list: WorkspaceList,
): CreateOptionsView | undefined {
  const rows = new Map(list.workspaces.map((row) => [row.workspaceId, row]));
  const workspaces: CreateWorkspace[] = [];
  for (const workspace of options.workspaces) {
    const row = rows.get(workspace.workspaceId);
    if (!row) {
      return undefined;
    }

    workspaces.push({
      ...workspace,
      kind: row.kind,
      name: row.name,
      path: row.path,
      specifications: row.specifications,
    });
  }

  return { ...options, workspaces };
}
