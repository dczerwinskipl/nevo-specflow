// Lifecycle (Close/Archive) capability boundary: the only entry other capabilities and the
// package surfaces (index, testing, diagnostics) use. Sub-folders: close/ (use cases),
// git/ (integration evidence and publication), journal/ (durable close journal).
export { previewCloseOperation, inspectCleanGitWorkspace, type CloseRequest } from './preflight';
export {
  reserveCloseOperation,
  inspectCloseOperation,
  previewWithDocumentFlush,
} from './reservation';
export {
  CloseOperationError,
  resourcesForClosePlan,
  type CloseJournal,
  type ClosePlan,
  type CloseOutcome,
  type CloseKind,
} from './model';
export { assertResourcesAvailable, resourcesForCreate } from './resources';
export { listCloseJournals, closeJournalPath } from './journal/store';
export { inspectCloseGitIntegration, type GitIntegrationInspection } from './git/integration';
export { prepareCloseGitIntegration } from './git/preparation';
export {
  publishCloseGitFastForward,
  reconcileCloseGitPublication,
  requireVerifiedCloseIntegration,
  proveAlreadyIntegratedClose,
  publishDivergentCloseCandidate,
} from './git/publication';
export {
  prepareDivergentCloseCandidate,
  verifyDivergentCloseCandidate,
  verifyDivergentCloseConflict,
  inspectDivergentCloseResolution,
  settleArchivedLinkedConflict,
  reconcileArchivedConflictScratch,
  disabledIntegrationHooksDirectory,
  type DivergentCloseNeedsResolution,
} from './git/scratch';
export {
  archiveSpecificationWithCommit,
  reconcileArchiveCommit,
  inspectArchiveRecovery,
  inspectArchivePhysicalRecovery,
} from './archive-effects';
export {
  rebindVerifiedClose,
  disposeReboundWorktree,
  reconcileDisposedWorktree,
  inspectPendingDisposal,
} from './worktree-disposal';
export { closeWorktree, closeWorkspace, type CloseWorktreeResult } from './close/worktree';
export { closeSpecification, type CloseSpecificationResult } from './close/specification';
