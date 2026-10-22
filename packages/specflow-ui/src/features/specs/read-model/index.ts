/**
 * Read model of the specs feature: the specification workspace data, its query keys and hook. A
 * leaf entry: it imports other features' read models only, never their screens, so documents,
 * sessions and git can use it without depending on the specification workspace UI.
 */
export { type SpecificationApi, createRuntimeSpecificationApi } from './api';
export { invalidateSpecificationWorkspace, specificationKeys } from './queries';
export { sessionActivityLabel } from './status-labels';
export { useSpecificationWorkspace } from './useSpecificationWorkspace';
export type { UseSpecificationWorkspaceResult } from './useSpecificationWorkspace';
export type {
  ActivityEvent,
  AttentionItem,
  DocumentItem,
  FeatureAttentionSource,
  RepoContext,
  SessionSummary,
  SpecificationChangesData,
  SpecificationSectionId,
  SpecificationSectionState,
  SpecificationWorkspaceData,
} from './model';
