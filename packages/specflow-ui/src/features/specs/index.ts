/**
 * Public API of the specs feature: the only module other features may import for the specification
 * workspace UI and its extension points. Data other features need (query keys, the workspace hook,
 * model types) is in `specs/read-model`; the route object is in `specs/routes` (composition only).
 */
export { specificationAttentionItems } from './extensions/specificationAttentionItems';
export { specificationWorkSections } from './extensions/specificationWorkSections';
export type { SpecificationWorkSectionContext } from './extensions/specificationWorkSections';
export { SpecificationAggregatePage } from './pages/SpecificationAggregatePage';
