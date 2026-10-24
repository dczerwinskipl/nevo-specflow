// Supported application and transport boundary. Test/fixture internals live in ./testing.
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
  parseCommitsPolicy,
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
  type OpenedDocument,
  type OpenedDocumentMetadata,
  type RegisteredDocumentSummary,
} from './specs/documents/reading';
export { catalogueRevision, projectCatalogue } from './specs/archetypes';

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
