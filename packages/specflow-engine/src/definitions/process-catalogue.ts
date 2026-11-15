import {
  createCatalogueSource,
  loadStableProjectCatalogue,
  type ArchetypeLookup,
  type CatalogueSource,
  type ProjectCatalogueResult,
  type ProjectHomeLike,
} from '../specs/definitions/catalogue-source';
import { createDefaultDefinitionRegistry } from './shipped-registry';

let processCatalogueSource: CatalogueSource | undefined;

/** The per-process catalogue source over the shipped kinds, used by the Engine entry points. */
export function defaultCatalogueSource(): CatalogueSource {
  processCatalogueSource ??= createCatalogueSource({ registry: createDefaultDefinitionRegistry() });

  return processCatalogueSource;
}

/** The catalogue of the Project Home of an Engine (stat-on-read, see {@link createCatalogueSource}). */
export function getProjectCatalogue(engine: ProjectHomeLike): Promise<ProjectCatalogueResult> {
  return defaultCatalogueSource().get(engine.context.project.homeRoot);
}

/** The state of one archetype definition of an Engine's Project Home: one `lstat` plus the memo. */
export function lookupProjectArchetype(
  engine: ProjectHomeLike,
  archetypeId: string,
): Promise<ArchetypeLookup> {
  return defaultCatalogueSource().lookupArchetype(engine.context.project.homeRoot, archetypeId);
}

/** {@link loadStableProjectCatalogue} over the per-process source, for the Engine entry points. */
export function getStableProjectCatalogue(
  engine: ProjectHomeLike,
): Promise<ProjectCatalogueResult> {
  return loadStableProjectCatalogue(defaultCatalogueSource(), engine.context.project.homeRoot);
}
