/**
 * The Engine for a host without a Project Home: the demo Runtime runs the real workflow operations
 * over state held in memory (`adr.0025-demo-runs-the-engine-in-memory`). Project hosts use
 * `openWorkflow` from the main entry.
 */
export {
  loadShippedExecutionEntities,
  openInMemoryWorkflow,
  type InMemoryWorkflowOptions,
} from './workflow/in-memory';
export { createMemoryWorkflowStore } from './workflow/state/memory-store';
