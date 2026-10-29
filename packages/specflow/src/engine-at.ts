import { openSpecFlowEngine, type SpecFlowEngine } from '@nevo/specflow-engine';

/** The Engine of the Project Home that `cwd` (or the required `projectRoot`) belongs to. */
export function engineAt(cwd: string, projectRoot?: string): Promise<SpecFlowEngine> {
  return openSpecFlowEngine({
    cwd,
    ...(projectRoot ? { projectRoot } : {}),
  });
}
