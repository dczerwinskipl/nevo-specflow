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

export type { CurrentSpecRecord } from './overview/repository/model';
export { createDemoSpecsRepositories, type DemoSpecsRepositoriesDeps } from './demo/repositories';
export { createDemoSpecs, type DemoSpecs } from './demo/operations';
export { registerDemoSpecRoutes } from './demo/endpoints';
