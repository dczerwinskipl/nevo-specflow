/** Internal integration-test surface. Not used by production adapters. */
export * from './index';

export { normalizeCreateClientIntent } from './specs/create';
export {
  PROJECT_HOME_MARKER_RELATIVE_PATH,
  PROJECT_STATE_RELATIVE_PATH,
} from './project/home/home';
export {
  WORKSPACE_REGISTRY_RELATIVE_PATH,
  WORKSPACE_REGISTRY_VERSION,
  MAX_MANAGED_WORKSPACE_SPECIFICATIONS,
  addWorkspace,
  bindSpecToWorkspace,
  initialWorkspaceRegistry,
  inspectRegisteredWorkspace,
  readWorkspaceRegistry,
  registerInitialPrimary,
  resolveSpecWorkspaceId,
  validateWorkspaceRegistry,
  verifyWorkspaceRoot,
  workspaceRegistryPath,
  type RegisteredWorkspaceInspection,
  type SpecWorkspaceBinding,
} from './project/workspace/registry/registry';
export {
  PROJECT_CONTROL_LOCK_RELATIVE_PATH,
  inspectProjectControlLock,
  projectControlLockPath,
  withProjectControlLock,
  type ProjectControlLockInspection,
  type ProjectControlLockOptions,
} from './project/control-lock';
export {
  initializeWorkspaceRegistry,
  updateWorkspaceRegistry,
} from './project/workspace/registry/store';
export {
  WORKSPACE_IDENTITY_RELATIVE_PATH,
  provisionLinkedWorkspaceIdentity,
  verifyLinkedWorkspaceIdentity,
} from './project/workspace/identity';
export { GIT_INSTANCE_SENTINEL_FILE } from './project/git-instance';
export {
  isValidSpecificationId,
  parseSpecificationManifest,
  parseSpecificationManifestText,
  specificationSlugFromTitle,
  validateSpecificationSlug,
} from './specs/model';
export {
  serializeSpecificationManifest,
  updateManifestRegistry,
} from './specs/manifest-serializer';
export {
  createSpecificationScaffold,
  type SpecificationScaffold,
  type SpecificationScaffoldFile,
  type SpecificationScaffoldInput,
} from './specs/scaffold';
export {
  listWorkspaceSpecifications,
  readWorkspaceSpecification,
  type WorkspaceSpecification,
} from './specs/repository';
export {
  createSpecification,
  type CreateSpecificationInput,
  type CreateSpecificationOptions,
  type CreateSpecificationTarget,
} from './specs/create';
export { CREATE_JOURNAL_RELATIVE_DIR } from './specs/create';
export { createSpecificationForTesting, type TestCreateOptions } from './specs/create';

// Internal verification surface for planned lifecycle operations; no transport mutations yet.
export { previewCloseOperation, type CloseRequest } from './specs/lifecycle';
export { reserveCloseOperation, inspectCloseOperation } from './specs/lifecycle';
export { CloseOperationError, type CloseJournal, type ClosePlan } from './specs/lifecycle';
export { assertResourcesAvailable, resourcesForCreate } from './specs/lifecycle';
export { listCloseJournals, closeJournalPath } from './specs/lifecycle';

/** E2.T11 read-only Git integration evidence; no publication side effects. */
export { inspectCloseGitIntegration } from './specs/lifecycle';
export type { GitIntegrationInspection } from './specs/lifecycle';

/** T11 internal durable preparation; no Git publication yet. */
export { prepareCloseGitIntegration } from './specs/lifecycle';

/** Internal T11 fast-forward publication/reconciliation, no CLI/HTTP route. */
export {
  publishCloseGitFastForward,
  reconcileCloseGitPublication,
  requireVerifiedCloseIntegration,
  proveAlreadyIntegratedClose,
} from './specs/lifecycle';

// E2.T11 detached divergent candidate: internal only, no primary publication.
export { prepareDivergentCloseCandidate, verifyDivergentCloseCandidate } from './specs/lifecycle';

/** T11 internal divergent publication and verified conflict inspection. */
export { publishDivergentCloseCandidate } from './specs/lifecycle';
export { verifyDivergentCloseConflict } from './specs/lifecycle';

export {
  inspectDivergentCloseResolution,
  type DivergentCloseNeedsResolution,
} from './specs/lifecycle';

/** T14 Engine-owned archive: no public CLI/HTTP close effect yet. */
export {
  archiveSpecificationWithCommit,
  reconcileArchiveCommit,
  inspectArchiveRecovery,
  inspectArchivePhysicalRecovery,
} from './specs/lifecycle';

/** E2.T12 scoped registry handover and non-force managed disposal. */
export {
  rebindVerifiedClose,
  disposeReboundWorktree,
  reconcileDisposedWorktree,
} from './specs/lifecycle';

/** E2.T13 Worktree Close use case (not a public transport endpoint). */
export { closeWorktree, closeWorkspace, type CloseWorktreeResult } from './specs/lifecycle';

/** Verified archived linked conflict: retains scratch metadata claim. */
export { settleArchivedLinkedConflict } from './specs/lifecycle';

/** Recovery inspection does not re-adopt a replaced linked checkout. */
export { inspectPendingDisposal } from './specs/lifecycle';

export { closeSpecification, type CloseSpecificationResult } from './specs/lifecycle';

export { reconcileArchivedConflictScratch } from './specs/lifecycle';

// Internal persistence/diagnostics APIs are intentionally NOT exported from the
// application package root. Low-level integration suites use this test surface.
export { inspectCreateSpecification, type CreatedSpecification } from './specs/create';
export { type CreateJournal, type CreateStage } from './specs/create';
export { projectCloseOperation, projectClosePreview } from './specs/operations/projection';
