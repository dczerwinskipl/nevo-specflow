import type { WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';

/** The kind line of a workspace: the project folder, or a worktree with its bound Specifications. */
export interface WorkspaceKindLine {
  readonly kind: 'projectFolder' | 'worktree';
  /** Titles of the Specifications bound to the workspace (already limited to the viewer). */
  readonly specifications: readonly string[];
}

export function kindLine(workspace: WorkspaceListItem): WorkspaceKindLine {
  return {
    kind: workspace.kind === 'primary' ? 'projectFolder' : 'worktree',
    specifications: workspace.specifications.map((spec) => spec.title),
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
