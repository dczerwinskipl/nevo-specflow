// Supported application and transport boundary. Test/fixture internals live in ./testing.
export {
  isGitIgnored,
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
} from './project/project-home';

export {
  WorkspaceRegistryError,
  type WorkspaceRegistration,
  type WorkspaceRegistry,
  type WorkspaceRegistryErrorCode,
} from './project/workspace-registry';

export { ProjectControlLockError, type ProjectControlLockErrorCode } from './project/control-lock';

export { openSpecFlowEngine, type SpecFlowEngine } from './application';
export { bootstrapProjectHome, assertPrimaryGitCheckout } from './project/bootstrap';

export {
  SpecificationError,
  type SpecificationErrorCode,
  type SpecificationLocation,
  type SpecificationManifest,
} from './specs/model';

export { GitCapabilityError, type GitCapabilityErrorCode } from './git/errors';

export {
  discoverSpecifications,
  resolveSpecification,
  type DiscoveredSpecification,
} from './specs/discovery';

export { inspectCreateSpecification, type CreatedSpecification } from './specs/durable-create';

export {
  readCanonicalSpecDocument,
  readCanonicalSpecSources,
  type CanonicalDocumentRead,
  type CanonicalSpecSource,
} from './specs/canonical-source';

export { CreateOperationError, type CreateJournal, type CreateStage } from './specs/create-journal';

export {
  createSpecificationFromRequest,
  type CreateSpecificationRequest,
} from './specs/create-request';

// Engine lifecycle entry points; transport adapters authorize each operation independently.
export { previewCloseOperation, type CloseRequest } from './specs/lifecycle/preflight';
export { inspectCloseOperation } from './specs/lifecycle/reservation';
export { closeWorktree, type CloseWorktreeResult } from './specs/lifecycle/close-worktree';
export { CloseOperationError, type ClosePlan, type CloseJournal } from './specs/lifecycle/model';

export {
  closeSpecification,
  type CloseSpecificationResult,
} from './specs/lifecycle/close-specification';

export { reconcileArchivedConflictScratch } from './specs/lifecycle/git-scratch';
