import { openSpecFlowEngine, type SpecFlowEngine } from '@nevo/specflow-engine';
import {
  startRuntime,
  type RuntimeHandle,
  type RuntimeStartOptions,
  type RuntimeWebApp,
} from '@nevo/specflow-runtime';

import { resolveProjectLayout, type ProjectLayout } from '../project/layout';
import { loadProductWebApp } from './web-app';

export interface StartProjectRuntimeDependencies {
  readonly openEngine?: (options: { cwd: string }) => Promise<SpecFlowEngine>;
  readonly resolveLayout?: (cwd: string) => Promise<ProjectLayout>;
  readonly start?: (options: RuntimeStartOptions) => Promise<RuntimeHandle>;
  readonly loadWebApp?: () => Promise<RuntimeWebApp>;
}

export async function startProjectRuntime(
  cwd: string,
  dependencies: StartProjectRuntimeDependencies = {},
  options: { readonly demo?: boolean } = {},
): Promise<RuntimeHandle> {
  if (options.demo) {
    const layout = await (dependencies.resolveLayout ?? resolveProjectLayout)(cwd);
    const webApp = await (dependencies.loadWebApp ?? loadProductWebApp)();
    return (dependencies.start ?? startRuntime)({
      projectRoot: layout.root,
      demo: true,
      projectConfigPath: layout.projectConfigPath,
      localConfigPath: layout.localConfigPath,
      dependencies: { webApp },
    });
  }
  // The current checkout is an execution workspace, not an operational
  // config authority. Both CLI and Runtime must pass the same Engine gate.
  const engine = await (dependencies.openEngine ?? openSpecFlowEngine)({ cwd });
  const project = engine.context.project;
  const webApp = await (dependencies.loadWebApp ?? loadProductWebApp)();
  return (dependencies.start ?? startRuntime)({
    projectRoot: project.homeRoot,
    projectConfigPath: project.projectConfigPath,
    localConfigPath: project.localConfigPath,
    dependencies: { webApp, specs: { engine } },
  });
}
