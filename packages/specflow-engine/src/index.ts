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

export {
  readCanonicalSpecDocument,
  readCanonicalSpecSources,
  type CanonicalDocumentRead,
  type CanonicalSpecSource,
} from './specs/canonical-source';

export { CreateOperationError } from './specs/create-journal';

export {
  createSpecificationFromRequest,
  type CreateSpecificationRequest,
} from './specs/create-request';

// Supported operation endpoints project the Engine's durable state to stable DTOs.
export { CloseOperationError } from './specs/lifecycle/model';
export {
  closeWorktreeOperation,
  closeSpecificationOperation,
  inspectPublicCloseOperation,
  previewPublicCloseOperation,
  planPublicCloseOperation,
  reconcileArchivedConflictScratchOperation,
  type PublicCloseInspection,
} from './specs/operation-api';

// Stable, transport-neutral operation summaries. Durable journals stay diagnostic.
export {
  projectCreatedSpecification,
  type PublicCreateOperation,
  type PublicCloseOperation,
  type PublicClosePreview,
  type PublicCloseStatus,
} from './specs/operation-projection';
