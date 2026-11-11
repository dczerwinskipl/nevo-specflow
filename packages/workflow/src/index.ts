// Neutral workflow kernel: compiled definitions, runs, pins, replay and the coordinator. It knows no
// host (SpecFlow Specification, Task, store, clock or actor); hosts hand it a Run value and persist
// what it returns. Boundaries are enforced by `workflowBoundaries` (tools/eslint/boundaries.mjs).
export {
  checkDefinition,
  findStep,
  type ExecutorClass,
  type HostAnnotations,
  type TerminalOutcome,
  type TransitionTarget,
  type WaitStep,
  type WorkStep,
  type WorkflowDefinition,
  type WorkflowReturn,
  type WorkflowStep,
  type WorkflowTransition,
} from './definitions/definition';
export { assertPinned, canonicalJson, isPinnedTo, type WorkflowPin } from './definitions/revision';
export { WORKFLOW_CORE_ERROR_CODES, WorkflowError } from './errors';
export {
  decide,
  type DeclaredEffect,
  type WorkflowDecision,
  type WorkflowIntent,
} from './execution/coordinator';
export {
  assertPositionJustified,
  handoffOf,
  isPositionJustified,
  lastArrival,
  type Handoff,
} from './execution/replay';
export {
  activeAttempt,
  newRun,
  type AttemptOutcome,
  type AttemptRecord,
  type ReturnRecord,
  type RunPosition,
  type WorkflowRun,
} from './execution/run';
