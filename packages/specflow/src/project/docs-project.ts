import type { DocsProject } from '@nevo/specflow-docs/cli';
import { resolveProjectHome } from '@nevo/specflow-engine';

import { resolveProjectLayout } from './layout';

/**
 * The project of a `docs` command: the checkout `cwd` belongs to, with its own configuration
 * (ADR 0022 §3, no Project Home fallback), and the Project Home as the seed of a missing index.
 */
export async function resolveDocsProject(cwd: string): Promise<DocsProject> {
  const layout = await resolveProjectLayout(cwd);

  return { ...layout, seedFrom: () => seedCheckout(layout.root) };
}

/**
 * The designated Project Home when `root` is another worktree of its repository, through the
 * Engine's read-only resolution (Git common directory, worktree list and home marker). `undefined`
 * in the Project Home itself and whenever the home cannot be resolved.
 */
async function seedCheckout(root: string): Promise<string | undefined> {
  try {
    const { project, workspace } = await resolveProjectHome({ cwd: root });

    return project.homeRoot === workspace.root ? undefined : project.homeRoot;
  } catch {
    // No single designated home, or Git cannot answer: no seed. A seed never fails a command.
    return undefined;
  }
}
