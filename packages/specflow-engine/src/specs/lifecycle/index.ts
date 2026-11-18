// Lifecycle (Close/Archive) capability entry point. Resource coordination imports the lower-level
// claim source directly, and the Engine application imports the host quiescence port directly.
// Sub-folders: close/ (use cases), git/ (integration evidence and publication),
// journal/ (durable close journal).
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
export type { SpecificationExitBlocker, SpecificationExitGuard } from './exit-guard';
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
export { withCheckoutQuiescence } from './checkout-quiescence';
export type {
  CheckoutQuiescence,
  CheckoutQuiescenceVerdict,
  CloseCheckout,
} from './checkout-quiescence-port';
export { closePreviewCheckoutBlocker } from './close-preview-occupancy';
export { closeWorktree, closeWorkspace, type CloseWorktreeResult } from './close/worktree';
export { closeSpecification, type CloseSpecificationResult } from './close/specification';
