// The definitions capability as the product composes it: the generic definitions module
// (`specs/definitions`) plus the shipped kinds, the process-wide project catalogue, the shipped seeds
// and the operations over a Project Home's definitions.
export * from '../specs/definitions';
export { createDefaultDefinitionRegistry } from './shipped-registry';
export {
  defaultCatalogueSource,
  getProjectCatalogue,
  getStableProjectCatalogue,
  lookupProjectArchetype,
} from './process-catalogue';
export { DefinitionSeedError, locateSeedDirectory, openSeedSource } from './seed';
export {
  listProjectDefinitions,
  showProjectDefinition,
  validateDefinitionsFolder,
  validateProjectDefinitions,
  type DefinitionsListing,
  type DefinitionsReport,
  type ListedDefinition,
  type ShownDefinition,
} from './inspect';
export {
  assertDefinitionsCommittable,
  assertInitialDefinitionsCommittable,
  commitInstalledDefinitions,
  initialDefinitionsBranchOffer,
  INITIAL_DEFINITIONS_BRANCH,
  startInitialDefinitionsBranch,
  installProjectDefinitionFiles,
  installProjectDefinitions,
  type InstallProjectOptions,
  type InstallProjectResult,
  type InstalledCommit,
} from './install-project';
