// Deterministic execution of Specifications and Tasks: one workflow core, two entry points.
export {
  closeInProgress,
  openArchetypeEditing,
  inspectActionsForRead,
  openWorkflow,
  readExecutionForRead,
  readTaskProgressForRead,
  type OpenWorkflowOptions,
  type ProjectDocumentHit,
  type SpecificationCheckout,
} from './composition';
export {
  createExecutionCatalogue,
  resolveExecutionCatalogue,
  resolveSpecificationExecution,
  type ExecutionCatalogue,
  type ExecutionEntities,
  type SpecificationExecutionResolution,
} from './definitions/catalogue';
export {
  AGENT_ARCHETYPE_KIND,
  TASK_TYPE_KIND,
  WORKFLOW_KIND,
  type AgentArchetype,
  type AgentArchetypeProvider,
  type DocumentGate,
  type EntryGate,
  type ExitGate,
  type SpecFlowAnnotations,
  type TaskType,
  type WaitStep,
  type WorkStep,
  type WorkflowDefinition,
  type WorkflowReturn,
  type WorkflowStep,
  type WorkflowSubjectKind,
  type WorkflowTransition,
} from './definitions/model';
export {
  rememberArchetypeModel,
  setArchetypeProviderModel,
  type ArchetypeModelChoice,
  type RememberModelDependencies,
} from './definitions/remember-model';
export {
  ATTENTION_ACTIONS,
  ATTENTION_ITEM_REASONS,
  BLOCKING_TASK_CAUSES,
  type AttentionAction,
  type AttentionActor,
  type AttentionItem,
  type AttentionItemReason,
  type BlockingTask,
  type BlockingTaskCause,
  type HeldTaskBlocks,
} from './attention/model';
export {
  ATTENTION_REASONS,
  resolveAgentLaunch,
  resolveContinuation,
  type AgentLaunch,
  type AttentionReason,
  type ContinuationDecision,
  type FinishingSession,
  type LaunchBlocker,
} from './continuation/resolve';
export {
  SPECIFICATION_BUSY_CAUSES,
  WORKFLOW_ERROR_CODES,
  SpecificationBusyError,
  WorkflowError,
  type SpecificationBusy,
  type SpecificationBusyCause,
  type WorkflowErrorCode,
} from './errors';
export {
  AGENT_UNAVAILABLE_REASONS,
  inspectActions,
  type ActionDependencies,
  type ActionPosition,
  type ActionProjection,
  RUNTIME_AGENT_UNAVAILABLE_REASONS,
  type AgentAttemptView,
  type ProjectHold,
  type AgentOption,
  type AgentUnavailableReason,
  type Availability,
  type PinPreview,
  type SpecificationExitActions,
  type SpecificationExitPort,
  type SpecificationLevelActions,
  type TaskTypeOption,
} from './operations/actions';
export type {
  DependencyCandidate,
  DependencyIneligibility,
  TaskAuthoringFacts,
  TaskContextEntryState,
} from './operations/task-authoring';
export {
  type StartBlocker,
  type StartableStep,
  type TaskActionUnavailableReason,
  type TaskLifecycleActions,
  type WorkflowActions,
  type WorkflowSummary,
} from './operations/actions';
export {
  CLOSE_BLOCKER_KINDS,
  SpecificationExitBlockedError,
  abandonBlockers,
  closeBlockers,
  specificationLifecycleActions,
  type AbandonAvailability,
  type CloseAvailability,
  type CloseBlocker,
  type CloseBlockerKind,
  type SpecificationExitState,
  type SpecificationLifecycleActions,
} from './close/blockers';
export {
  abandonSpecification,
  type AbandonSpecificationInput,
  type AbandonSpecificationResult,
} from './operations/abandon';
export { readSpecificationExitState } from './operations/specification-exit';
export { finishStep, type FinishStepInput, type FinishStepResult } from './operations/finish';
export {
  NO_POST_ACTIONS,
  type PostActionName,
  type PostActionResult,
  type StepFinishedEvent,
  type WorkflowPostActions,
} from './operations/post-actions';
export { inspectExecution, type ExecutionInspection } from './operations/inspect';
export {
  readExecution,
  readTaskProgress,
  type ExecutionReading,
  type ReadExecutionOptions,
  taskFactsOf,
  type BrokenTaskFacts,
  type TaskFacts,
  type TaskPreparation,
  type TaskProgress,
} from './operations/execution-read';
export type { ExecutionHolds, WorkflowDependencies } from './operations/loaded-execution';
export {
  reevaluateWait,
  type ReevaluateWaitInput,
  type ReevaluateWaitResult,
} from './operations/reevaluate-wait';
export { returnToStep, type ReturnToStepInput, type ReturnToStepResult } from './operations/return';
export {
  admitAgentTurn,
  AttributionRefusalError,
  confirmAgentResult,
  rejectAgentResult,
  type AgentResultDecisionInput,
  type ConfirmAgentResultInput,
  type ConfirmAgentResultResult,
  type RejectAgentResultInput,
  type RejectAgentResultResult,
  finalizeAgentAttempt,
  openAgentAttempts,
  type AgentDeclaredChanges,
  type AgentTurnAdmissionInput,
  type AttributionDetails,
  proposeAgentFinish,
  readAgentAttempt,
  recoverAgentAttempts,
  retryAgentAttemptCommit,
  retryAgentPostActions,
  runAgentPostActions,
  type RetryAgentAttemptCommitInput,
  type RetryAgentAttemptCommitResult,
  readAgentTurnContext,
  startAgentAttempt,
  type AgentTurnContextInput,
  AGENT_ATTEMPT_EVENT_KINDS,
  readAgentAttemptHistory,
  readAgentAttemptWork,
  readWorkflowHistory,
  returnDuringAgentAttempt,
  assertAgentTurnAdmissible,
  settleAbandonedAgentTurn,
  takeOverAgentAttempt,
  type AgentAttemptEvent,
  type AgentAttemptHistory,
  type AgentAttemptWork,
  type AgentHistorySources,
  type AgentTakeOver,
  type OwnerReturnResult,
  type TakeOverAgentAttemptInput,
  type TakeOverAgentAttemptResult,
  WORKFLOW_HISTORY_LIMIT,
  type WorkflowHistory,
  type WorkflowHistoryItem,
  type AgentAttemptDependencies,
  type AgentAttemptJournal,
  type AgentAttemptRecovery,
  type AgentDirtySet,
  type AgentFinishProposal,
  type AgentPostActionRecord,
  type AgentProposalState,
  type AgentRefusal,
  type AgentReturnRequest,
  type AgentTurnBinding,
  type FinalizeAgentAttemptInput,
  type FinalizeAgentAttemptResult,
  type FinalizeBoundary,
  type AgentTurnIdentity,
  type ProposeAgentFinishInput,
  type ProposeAgentFinishResult,
  type StartAgentAttemptInput,
  type StartAgentAttemptResult,
} from './agent';
export {
  startSpecificationExecution,
  startTaskExecution,
  type ExpectedPosition,
  type StartResult,
  type StartSpecificationInput,
  type StartTaskInput,
} from './operations/start';
export {
  engineAgentContextSource,
  gatherAgentContext,
  readStepContext,
  type AgentContextSource,
  type AgentStepContext,
  type ContextArchetype,
  type ContextDocument,
  type ContextDocumentType,
  type ContextEntry,
  type ContextInstructions,
  type ContextReference,
} from './agent/context';
export {
  AGENT_WRITE_OPERATIONS,
  activeAgentAttempt,
  agentAttemptScope,
  admitAgentOperation,
  deriveAgentScope,
  type AgentOperationTarget,
  type AgentScopeBinding,
  type AgentScopeDecision,
  type AgentScopeRefusalReason,
  type AgentWriteOperation,
  type AgentWriteScope,
} from './agent/scope';
export type {
  StepContext,
  StepDescription,
  TransitionDescription,
} from './operations/step-context';
export {
  createTask,
  editTask,
  removeTask,
  type AgentDraftAttempt,
  type CreateTaskInput,
  type EditTaskInput,
  type RemoveTaskInput,
  type TaskResourceResult,
} from './operations/task-resource';
export {
  TaskContextInvalidError,
  TaskContextUnresolvedError,
  type InvalidContextEntry,
  type AwaitedContextEntry,
  type UnresolvedContextEntry,
} from './operations/task-policy';
export {
  GATE_UNSATISFIED_REASONS,
  type GateScopeRef,
  type GateStatus,
  type GateUnsatisfiedReason,
} from './gates/evaluate';
export { GateUnsatisfiedError } from './gates/read';
export type { TaskReferences } from './operations/task-references';
export {
  setTaskStatus,
  type SetTaskStatusInput,
  type SetTaskStatusResult,
} from './operations/task-status';
export type { FinishInput } from './input-schema';
export { TASK_STATUSES } from './state/model';
export type {
  AgentActor,
  AgentAttemptBinding,
  AttemptRecord,
  ExecutionTask,
  OwnerActor,
  SpecificationExecutionRecord,
  TaskRunRecord,
  TaskStatus,
  TaskStatusChange,
  WorkflowActor,
  WorkflowRun,
  WorkflowSubject,
} from './state/model';
export type { ExecutionChange, ExecutionSnapshot, Versioned, WorkflowStore } from './state/store';
export type { TaskDecision, TaskDecisionStatus, TaskProposal, TaskReadiness } from './tasks/tasks';
export {
  DraftConflictError,
  OPEN_TASK_CAUSES,
  TasksOpenError,
  type ClosableTask,
  type DraftConflict,
  type FinishClosure,
  type OpenTask,
  type OpenTaskCause,
} from './tasks/tasks';
// The neutral core's run model, as SpecFlow stores and returns it.
export type {
  AttemptOutcome,
  ExecutorClass,
  Handoff,
  ReturnRecord,
  RunAbandonment,
  RunPosition,
  TerminalOutcome,
  TransitionTarget,
  WorkflowPin,
} from '@nevo/workflow';
