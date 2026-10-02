import { startRuntime, type RuntimeHandle, type RuntimeStartOptions } from '@nevo/specflow-runtime';

import { resolveProjectLayout, type ProjectLayout } from '../project/layout.js';

export interface StartProjectRuntimeDependencies {
  readonly resolveLayout?: (cwd: string) => Promise<ProjectLayout>;
  readonly start?: (options: RuntimeStartOptions) => Promise<RuntimeHandle>;
}

export async function startProjectRuntime(
  cwd: string,
  dependencies: StartProjectRuntimeDependencies = {},
): Promise<RuntimeHandle> {
  const layout = await (dependencies.resolveLayout ?? resolveProjectLayout)(cwd);
  return (dependencies.start ?? startRuntime)({
    projectRoot: layout.root,
    projectConfigPath: layout.projectConfigPath,
    localConfigPath: layout.localConfigPath,
  });
}
