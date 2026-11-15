import { openEngineBoundary, type SpecFlowEngine } from './application';
import type { ResolveProjectHomeOptions } from './project/home/home';
import { specificationCloseBlockers } from './workflow/composition';

/**
 * Composition root of the opened Engine: the application boundary with the ports one capability
 * supplies to another. Close's Specification exit gate (D07) is the workflow's `closeBlockers`.
 */
export function openSpecFlowEngine(options: ResolveProjectHomeOptions): Promise<SpecFlowEngine> {
  return openEngineBoundary(options, {
    specificationExit: (engine) => (specId) => specificationCloseBlockers(engine, specId),
  });
}
