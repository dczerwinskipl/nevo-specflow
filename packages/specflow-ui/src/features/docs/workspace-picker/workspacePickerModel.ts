import type {
  WorkspaceListItem,
  WorkspaceUnavailableReason,
} from '@nevo/specflow-contracts/workspaces';

/**
 * A state of a workspace shown in the switcher's status slot: an unavailable explicit pick (with
 * its reason) wins over local changes. A detached checkout has no `dirty` flag, so no status.
 */
export type WorkspaceStatus =
  | { readonly kind: 'localChanges' }
  | { readonly kind: 'unavailable'; readonly reason: WorkspaceUnavailableReason };

/** The workspace-specific metadata the shared context switcher shows. */
export interface WorkspaceFacts {
  readonly kind: 'projectFolder' | 'worktree';
  /** Titles of the Specifications bound to the workspace (already limited to the viewer). */
  readonly specifications: readonly string[];
  /** The workspace the current Session runs in. */
  readonly sessionWorkspace: boolean;
  readonly status?: WorkspaceStatus;
}

export function workspaceFacts(
  workspace: WorkspaceListItem,
  sessionWorkspaceId?: string,
): WorkspaceFacts {
  const status: WorkspaceStatus | undefined =
    !workspace.available && workspace.unavailableReason
      ? { kind: 'unavailable', reason: workspace.unavailableReason }
      : workspace.available && workspace.dirty
        ? { kind: 'localChanges' }
        : undefined;

  return {
    kind: workspace.kind === 'primary' ? 'projectFolder' : 'worktree',
    specifications: workspace.specifications.map((spec) => spec.title),
    sessionWorkspace: workspace.workspaceId === sessionWorkspaceId,
    ...(status ? { status } : {}),
  };
}

const segments = (path: string) =>
  path
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '');

/**
 * An absolute workspace folder shortened for display relative to the project folder: `.` for the
 * project folder itself, `sub/dir` below it, `../name` for a sibling folder, the absolute path
 * otherwise (or when the project folder is unknown).
 */
export function displayPath(path: string, projectFolderPath: string | undefined): string {
  if (projectFolderPath === undefined) {
    return path;
  }

  const target = segments(path);
  const base = segments(projectFolderPath);
  // Windows drive letters are case-insensitive.
  const same = (index: number) =>
    target[index] === base[index] ||
    (index === 0 &&
      /^[A-Za-z]:$/.test(base[0] ?? '') &&
      target[0]?.toLowerCase() === base[0]?.toLowerCase());
  let common = 0;
  while (common < target.length && common < base.length && same(common)) {
    common += 1;
  }

  if (common === base.length) {
    return target.length === common ? '.' : target.slice(common).join('/');
  }

  if (common === base.length - 1 && common > 0 && target.length > common) {
    return `../${target.slice(common).join('/')}`;
  }

  return path;
}
