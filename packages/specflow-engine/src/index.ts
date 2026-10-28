// Supported application and transport boundary. Test/fixture internals live in ./testing.
export {
  admitWorkspaceExecution,
  markWorkspaceExecutionDispatched,
  markWorkspaceExecutionUnknown,
  abandonWorkspaceExecutionAdmission,
  settleWorkspaceExecution,
  WorkspaceExecutionError,
  inspectWorkspaceExecution,
  listUnsettledWorkspaceExecutions,
} from './execution';
export type {
  WorkspaceExecutionIntent,
  WorkspaceExecutionReceipt,
  WorkspaceExecutionJournal,
} from './execution';
export {
  isGitIgnored,
  areGitIgnored,
  LOCAL_CONFIG_RELATIVE_PATH,
  LOCAL_IGNORE_ENTRY,
  PROJECT_CONFIG_RELATIVE_PATH,
  resolveGitCheckoutLayout,
  type GitCheckoutLayout,
} from './project/git-checkout';

export {
  ProjectHomeError,
  resolveProjectHome,
  type ProjectHomeErrorCode,
  type ResolveProjectHomeOptions,
  type ResolvedProjectHome,
} from './project/home/home';

export {
  WorkspaceRegistryError,
  type WorkspaceRegistration,
  type WorkspaceRegistry,
  type WorkspaceRegistryErrorCode,
} from './project/workspace/registry/registry';

export { ProjectControlLockError, type ProjectControlLockErrorCode } from './project/control-lock';

export { openSpecFlowEngine, readRegistrySnapshot, type SpecFlowEngine } from './application';
export { bootstrapProjectHome, assertPrimaryGitCheckout } from './project/bootstrap';

export {
  SpecificationError,
  type SpecificationErrorCode,
  type SpecificationLocation,
  type SpecificationManifest,
} from './specs/model';

export {
  DEFAULT_BRANCH_PATTERN,
  effectiveAutoCommit,
  parseCommitsPolicy,
  type AutoCommitSettings,
  type AutoCommitSource,
  type CommitCapability,
  type EffectiveAutoCommit,
  resolveWorktreesRoot,
  validateBranchPattern,
} from './version-control/worktrees/policy';

export {
  BRANCH_PATTERN_MAX_ENTRIES,
  BRANCH_PATTERN_MAX_LENGTH,
  branchPatternProblem,
  matchesBranchPattern,
  type BranchPatternProblem,
} from './version-control/commits/branch-patterns';

export { GitCapabilityError, type GitCapabilityErrorCode } from './git/errors';
export { inspectLocalBranches, type LocalBranches } from './version-control/git/branches';

export {
  discoverSpecifications,
  resolveSpecification,
  resolveSpecificationForRead,
  type DiscoveredSpecification,
} from './specs/discovery';

export {
  readCanonicalSpecDocument,
  readCanonicalSpecSources,
  type CanonicalDocumentRead,
  type CanonicalSpecSource,
} from './specs/canonical-source';

export { CreateOperationError } from './specs/create';
export { DocumentError } from './specs/documents';
export {
  openSpecificationDocument,
  readRegisteredDocumentSummaries,
  readSpecificationDocument,
  readSpecificationDocumentTree,
  readSpecificationUncommitted,
  DOCUMENT_ROW_PENDING_AFTER_MS,
  listDocumentOperationRows,
  readDocumentOperationStatus,
  type DocumentChangeListingRow,
  type OperationStatusOptions,
  type OpenedDocument,
  type OpenedDocumentMetadata,
  type RegisteredDocumentSummary,
} from './specs/documents/reading';
export { applyDocumentChange, resumeDocumentChange } from './specs/documents/api';
export { normalizeDocumentOperationInput } from './specs/documents/changes/plan/request';
export type { DocumentChangeResult, DocumentWriteOptions } from './specs/documents/write';
export {
  DOCUMENT_SHUTDOWN_DEADLINE_MS,
  createDocumentQueueScheduler,
  disabledDocumentQueueScheduler,
  takeOverDocumentQueue,
  type DocumentQueueScheduler,
  type DocumentQueueTakeoverOptions,
  type DocumentQueueTakeoverResult,
  type SchedulerEvent,
  type SchedulerOptions,
  type SchedulerStopOptions,
  type SchedulerStopOutcome,
} from './specs/documents/scheduler';
export {
  DOCUMENT_FLUSH_WAIT_CAP_MS,
  abandonDocumentCommit,
  drainQueue,
  flushAllDocumentCommits,
  flushDocumentCommits,
  retryDocumentCommit,
  type FlushAllOutcome,
  type FlushOutcome,
  type RecoverMode,
} from './specs/documents/queue';
export type { QueueRunResult } from './specs/documents/queue';
export {
  manualCommit,
  readUncommittedScope,
  recoverOperation,
  resolveLedgerOperation,
  type ManualCommitCommand,
  type ManualCommitCommandOptions,
  type ManualCommitCommandResult,
  type RecoverOperationResult,
  type ResolveLedgerResult,
  type UncommittedScopeEntry,
  type UncommittedScopeView,
} from './specs/documents/manual-commit';
export {
  MANUAL_COMMIT_RECOVERY_CODE,
  listManualCommitRows,
  type ManualCommitListingRow,
  type ManualCommitRecoverMode,
  type ManualCommitScope,
} from './specs/manual-commit';
export type { ControlLockTakeoverResult } from './project/control-lock-takeover';
export { toArchetypeCatalogue } from './specs/archetypes';
export {
  DefinitionInstallError,
  DefinitionSeedError,
  getProjectCatalogue as loadProjectCatalogue,
  listProjectDefinitions,
  showProjectDefinition,
  validateDefinitionsFolder,
  validateProjectDefinitions,
  type DefinitionsListing,
  type DefinitionsReport,
  type ListedDefinition,
  type ShownDefinition,
  assertInitialDefinitionsCommittable,
  commitInstalledDefinitions,
  installProjectDefinitionFiles,
  installProjectDefinitions,
  type InstalledCommit,
  type InstallProjectResult,
  type InstallOptions,
  type InstallAction,
  type InstallItem,
  type InstallPlan,
  type InstallPlanOutcome,
  type InstallProjectOptions,
  type InstallResult,
  type ProjectCatalogue,
  type ProjectCatalogueResult,
  type ResolvedCatalogue,
} from './specs/definitions';

// Pure document rules (no I/O). The demo Runtime builds its in-memory Specifications with them, so
// its document answers (catalogue, scaffold, ids, paths, kinds, titles, tree) match the Engine's.
export { renderTemplate, templateValues } from './specs/archetypes';
// Builds a catalogue from definitions already in memory (the demo Runtime's copy of the seeds).
export { resolveCatalogue } from './specs/definitions';
export {
  OVERVIEW_DOCUMENT_ID,
  OVERVIEW_DOCUMENT_TYPE,
  TEXT_CONTENT_MAX_BYTES,
  allocateDocumentId,
  classifyContent,
  deriveDocumentTitle,
  deriveUnclassifiedDocumentId,
  extensionOf,
  isEditable,
  validateDocumentPath,
  validateFolderPath,
} from './specs/documents';
export {
  projectDocumentTree,
  type ObservedFile,
  type PolicyReason,
} from './specs/documents/reading';
export {
  ScaffoldValidationError,
  createSpecificationScaffold,
  documentErrorOf,
} from './specs/scaffold';

export {
  resolveCreateArchetype,
  createSpecificationFromRequest,
  resumeInterruptedCreateOperation,
  type ResumeCreateOptions,
  type CreateSpecificationRequest,
  type CreateSpecificationRequestOptions,
} from './specs/create';
export type { CreateStageObservation, CreateStageObserver } from './specs/create';

export { inspectPublicCreateOperation, type PublicCreateInspection } from './specs/create';

export {
  listPublicCreateOperations,
  readPublicCreateOperationRow,
  type PublicCreateListingRow,
  type PublicCreateListingState,
} from './specs/create';
export { createStepForStage, type PublicCreateStepId } from './specs/create';

export {
  inspectCreateOptions,
  type InspectCreateOptionsOptions,
  willCommitCreatedScaffold,
  type PublicCreateOptions,
  type CreateWorkspaceOption,
  type CreateBaseRefOption,
} from './specs/create';

// Supported operation endpoints project the Engine's durable state to stable DTOs.
export { CloseOperationError } from './specs/lifecycle';
export {
  closeWorktreeOperation,
  closeWorkspaceOperation,
  planPublicWorkspaceCloseOperation,
  inspectPublicWorkspaceCloseOperation,
  closeSpecificationOperation,
  inspectPublicCloseOperation,
  previewPublicCloseOperation,
  planPublicCloseOperation,
  reconcileArchivedConflictScratchOperation,
  type PlanPublicCloseOptions,
  type PublicCloseInspection,
} from './specs/operations/api';

// Stable, transport-neutral operation summaries. Durable journals stay diagnostic.
export {
  projectCreatedSpecification,
  type PublicCreateOperation,
  type PublicCloseOperation,
  type PublicClosePreview,
  type PublicCloseStatus,
  type PublicWorkspaceClosePreview,
  type PublicWorkspaceCloseOperation,
} from './specs/operations/projection';
