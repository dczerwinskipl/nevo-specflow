// Neutral workflow kernel: compiled definitions, runs, pins, replay and the coordinator. It knows no
// host (SpecFlow Specification, Task, store, clock or actor); hosts hand it a Run value and persist
// what it returns. Boundaries are enforced by `workflowBoundaries` (tools/eslint/boundaries.mjs).
export {
  EXECUTOR_CLASSES,
  checkDefinition,
  findStep,
  type DefinitionProblem,
  type ExecutorClass,
  type HostAnnotations,
  type NoAnnotations,
  type TerminalOutcome,
  type TransitionTarget,
  type WaitStep,
  type WorkStep,
  type WorkflowDefinition,
  type WorkflowReturn,
  type WorkflowStep,
  type WorkflowTransition,
} from './definitions/definition';
export {
  assertPinned,
  canonicalJson,
  definitionRevision,
  isPinnedTo,
  pinOf,
  type WorkflowPin,
} from './definitions/revision';
export { WORKFLOW_CORE_ERROR_CODES, WorkflowError, type WorkflowCoreErrorCode } from './errors';
export {
  decide,
  intentOf,
  type DeclaredEffect,
  type WorkflowCommand,
  type WorkflowDecision,
  type WorkflowIntent,
} from './execution/coordinator';
export {
  assertPositionJustified,
  handoffOf,
  isPositionJustified,
  lastArrival,
  type Handoff,
  type RunArrival,
} from './execution/replay';
export {
  activeAttempt,
  newRun,
  nextAttemptNumber,
  type ActorRecord,
  type AttemptOutcome,
  type AttemptRecord,
  type ReturnRecord,
  type RunPosition,
  type WorkflowRun,
} from './execution/run';
