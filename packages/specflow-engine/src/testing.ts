/** Internal integration-test surface. Not used by production adapters. */
export * from './index';

export {
  PROJECT_HOME_MARKER_RELATIVE_PATH,
  PROJECT_STATE_RELATIVE_PATH,
} from './project/project-home';
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
} from './project/workspace-registry';
export {
  PROJECT_CONTROL_LOCK_RELATIVE_PATH,
  inspectProjectControlLock,
  projectControlLockPath,
  withProjectControlLock,
  type ProjectControlLockInspection,
  type ProjectControlLockOptions,
} from './project/control-lock';
export { initializeWorkspaceRegistry, updateWorkspaceRegistry } from './project/registry-store';
export {
  WORKSPACE_IDENTITY_RELATIVE_PATH,
  provisionLinkedWorkspaceIdentity,
  verifyLinkedWorkspaceIdentity,
} from './project/workspace-identity';
export { GIT_INSTANCE_SENTINEL_FILE } from './project/git-instance';
export {
  createSpecificationScaffold,
  isValidSpecificationId,
  parseSpecificationManifest,
  specificationSlugFromTitle,
  validateSpecificationSlug,
  type SpecificationScaffold,
  type SpecificationScaffoldFile,
  type SpecificationScaffoldInput,
} from './specs/model';
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
} from './specs/durable-create';
export { CREATE_JOURNAL_RELATIVE_DIR } from './specs/create-journal';
export { createSpecificationForTesting, type TestCreateOptions } from './specs/create-test-support';

// Internal verification surface for planned lifecycle operations; no transport mutations yet.
export { previewCloseOperation, type CloseRequest } from './specs/lifecycle/preflight';
export { reserveCloseOperation, inspectCloseOperation } from './specs/lifecycle/reservation';
export { CloseOperationError, type CloseJournal, type ClosePlan } from './specs/lifecycle/model';
export { assertResourcesAvailable, resourcesForCreate } from './specs/lifecycle/resources';
export { listCloseJournals, closeJournalPath } from './specs/lifecycle/journal-store';

/** E2.T11 read-only Git integration evidence; no publication side effects. */
export { inspectCloseGitIntegration } from './specs/lifecycle/git-integration';
export type { GitIntegrationInspection } from './specs/lifecycle/git-integration';

/** T11 internal durable preparation; no Git publication yet. */
export { prepareCloseGitIntegration } from './specs/lifecycle/git-preparation';

/** Internal T11 fast-forward publication/reconciliation, no CLI/HTTP route. */
export {
  publishCloseGitFastForward,
  reconcileCloseGitPublication,
  requireVerifiedCloseIntegration,
  proveAlreadyIntegratedClose,
} from './specs/lifecycle/git-publication';

// E2.T11 detached divergent candidate: internal only, no primary publication.
export {
  prepareDivergentCloseCandidate,
  verifyDivergentCloseCandidate,
} from './specs/lifecycle/git-scratch';

/** T11 internal divergent publication and verified conflict inspection. */
export { publishDivergentCloseCandidate } from './specs/lifecycle/git-publication';
export { verifyDivergentCloseConflict } from './specs/lifecycle/git-scratch';

export {
  inspectDivergentCloseResolution,
  type DivergentCloseNeedsResolution,
} from './specs/lifecycle/git-scratch';

/** T14 Engine-owned archive: no public CLI/HTTP close effect yet. */
export {
  archiveSpecificationWithCommit,
  reconcileArchiveCommit,
  inspectArchiveRecovery,
  inspectArchivePhysicalRecovery,
} from './specs/lifecycle/archive-effects';

/** E2.T12 scoped registry handover and non-force managed disposal. */
export {
  rebindVerifiedClose,
  disposeReboundWorktree,
  reconcileDisposedWorktree,
} from './specs/lifecycle/worktree-disposal';

/** E2.T13 Worktree Close use case (not a public transport endpoint). */
export {
  closeWorktree,
  closeWorkspace,
  type CloseWorktreeResult,
} from './specs/lifecycle/close-worktree';

/** Verified archived linked conflict: retains scratch metadata claim. */
export { settleArchivedLinkedConflict } from './specs/lifecycle/git-scratch';

/** Recovery inspection does not re-adopt a replaced linked checkout. */
export { inspectPendingDisposal } from './specs/lifecycle/worktree-disposal';

export {
  closeSpecification,
  type CloseSpecificationResult,
} from './specs/lifecycle/close-specification';

export { reconcileArchivedConflictScratch } from './specs/lifecycle/git-scratch';

// Internal persistence/diagnostics APIs are intentionally NOT exported from the
// application package root. Low-level integration suites use this test surface.
export { inspectCreateSpecification, type CreatedSpecification } from './specs/durable-create';
export { type CreateJournal, type CreateStage } from './specs/create-journal';
export { projectCloseOperation, projectClosePreview } from './specs/operation-projection';
