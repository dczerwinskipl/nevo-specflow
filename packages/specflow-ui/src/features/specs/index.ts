/** Public API of the specs feature: the only module other features may import. */
export { specificationAttentionItems } from './extensions/specificationAttentionItems';
export { specificationWorkSections } from './extensions/specificationWorkSections';
export type { SpecificationWorkSectionContext } from './extensions/specificationWorkSections';
export { SpecificationAggregatePage } from './pages/SpecificationAggregatePage';
export { specificationKeys } from './queries';
export { specificationRoute } from './routes';
export { useSpecificationWorkspace } from './useSpecificationWorkspace';
export type {
  DocumentItem,
  RepoContext,
  SessionSummary,
  SpecificationChangesData,
  SpecificationWorkspaceData,
} from './workspace/model';
export { sessionActivityLabel } from './workspace/status-labels';
