export {
  createSpecsFeature,
  type CreateSpecsFeatureOptions,
  type SpecsFeatureDependencies,
} from './feature';

export {
  defaultSpecsFeatureConfig,
  parseSpecsFeatureConfig,
  type SpecsFeatureConfig,
} from './configuration';

export { ProjectGitCapabilities, SpecCapabilities } from '@nevo/specflow-contracts/specs';
export { specScope, type ProjectIdSource } from './scope';
export type { FirstStepStarter } from './create/first-step';
export { composeWorkspaceActivity } from './workspace/activity';
export { releaseAfterQuiescence } from './close/release-workspace';

export type { CurrentSpecRecord } from './overview/repository/model';
export { createDemoSpecsRepositories, type DemoSpecsRepositoriesDeps } from './demo/repositories';
export { createDemoSpecs, type DemoSpecs } from './demo/operations';
export { registerDemoSpecRoutes } from './demo/endpoints';
export { createDemoWorkspaceList } from './demo/workspace-list';
