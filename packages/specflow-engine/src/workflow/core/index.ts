// Neutral workflow core: compiled definitions, runs, pins, replay and the coordinator. It imports
// only `node:` builtins and its own files (checked by tools/eslint/check-import-cycles.mjs), so it
// can become its own package.
export {
  decide,
  intentOf,
  type DeclaredEffect,
  type WorkflowCommand,
  type WorkflowDecision,
  type WorkflowIntent,
} from './coordinator';
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
} from './definition';
export { WORKFLOW_CORE_ERROR_CODES, WorkflowError, type WorkflowCoreErrorCode } from './errors';
export {
  assertPositionJustified,
  handoffOf,
  isPositionJustified,
  lastArrival,
  type Handoff,
  type RunArrival,
} from './replay';
export {
  assertPinned,
  canonicalJson,
  definitionRevision,
  isPinnedTo,
  pinOf,
  type WorkflowPin,
} from './revision';
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
} from './run';
