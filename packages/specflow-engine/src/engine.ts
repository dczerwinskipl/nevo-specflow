import { openEngineBoundary, type SpecFlowEngine } from './application';
import type { ResolveProjectHomeOptions } from './project/home/home';
import {
  agentAttemptCommitWait,
  attemptCommitExecutions,
  failedAgentAttemptCommits,
} from './workflow/agent/finalize/attempt-commit/close';
import { specificationCloseBlockers, specificationStepInProgress } from './workflow/composition';

/**
 * Composition root of the opened Engine: the application boundary with the ports one capability
 * supplies to another. Close's Specification exit gate (D07) is the workflow's `closeBlockers`.
 */
export function openSpecFlowEngine(options: ResolveProjectHomeOptions): Promise<SpecFlowEngine> {
  return openEngineBoundary(options, {
    specificationExit: (engine) => (specId) => specificationCloseBlockers(engine, specId),
    stepInProgress: (engine) => (specId) => specificationStepInProgress(engine, specId),
    failedAttemptCommits: (engine) => (workspaceId) =>
      failedAgentAttemptCommits(engine, workspaceId),
    attemptCommitWait: (engine) => (attemptId) => agentAttemptCommitWait(engine, attemptId),
    attemptCommitExecutions: (engine) => (workspaceId) =>
      attemptCommitExecutions(engine, workspaceId),
  });
}
