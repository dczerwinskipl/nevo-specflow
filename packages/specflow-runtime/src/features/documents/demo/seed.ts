import { allocateDocumentId, type ResolvedCatalogue } from '@nevo/specflow-engine';
import type { DemoSpecification } from '../../demo-catalogue';
import { binaryFile, textFile, type DemoFile, type DemoSpecDocuments } from './model';
import { defaultSeed, specSeeds, type SeedFile } from './seed-files';
import { demoShowcaseSpecId, showcaseFiles, showcaseFolders, showcaseOverview } from './showcase';

/** Other demo data (Task links) refers to the seeded overview by this revision. */
export const SEED_OVERVIEW_REVISION = 'demo-document-1';
const SEED_CREATED = '2026-10-01';

/** Snapshot of an archetype as a manifest records it at Create. */
export function archetypeSnapshot(catalogue: ResolvedCatalogue, archetypeId: string) {
  const archetype = catalogue.findArchetype(archetypeId);
  if (!archetype) throw new Error(`Demo archetype "${archetypeId}" is missing.`);
  return {
    archetype: {
      id: archetype.id,
      version: archetype.version,
      requirements: archetype.requirements.map((item) => ({
        documentType: item.documentType,
        minCount: item.minCount,
      })),
    },
    archetypeTitle: archetype.title,
  };
}

/**
 * The document directory of a seeded (catalogue) Specification, built once on first use. Registered
 * ids are allocated by the Engine's rule, so the overview is `overview` and a first document of a
 * type takes the type id.
 */
export function seedDocuments(
  record: DemoSpecification,
  catalogue: ResolvedCatalogue,
  options: { showcase?: boolean } = {},
): DemoSpecDocuments {
  const showcase = options.showcase === true && record.id === demoShowcaseSpecId;
  const seed = specSeeds[record.id] ?? defaultSeed;
  const allocationId = 'seed:' + record.id;
  const overview: SeedFile = {
    path: 'overview.md',
    type: 'overview',
    text: showcase
      ? showcaseOverview
      : '# ' + record.title + '\n\nDemonstration Specification for ' + record.id + '.',
  };
  const files = new Map<string, DemoFile>();
  const registry: DemoSpecDocuments['registry'] = [];
  const register = (path: string, type: string) =>
    registry.push({
      id: allocateDocumentId({
        specId: allocationId,
        type,
        position: registry.length,
        existingIds: registry.map((entry) => entry.id),
      }),
      path,
      type,
    });
  for (const file of [overview, ...seed.files, ...(showcase ? showcaseFiles : [])]) {
    files.set(
      file.path,
      file.bytes
        ? binaryFile(file.bytes)
        : textFile(file.text ?? '', file === overview ? SEED_OVERVIEW_REVISION : undefined),
    );
    if (file.type) register(file.path, file.type);
  }
  for (const entry of seed.dangling ?? []) register(entry.path, entry.type);
  return {
    ...archetypeSnapshot(catalogue, seed.archetypeId),
    registry,
    folders: [...(seed.folders ?? []), ...(showcase ? showcaseFolders : [])],
    files,
    location: seed.location ?? 'active',
    ...(seed.policyReason ? { policyReason: seed.policyReason } : {}),
    allocationId,
    title: record.title,
    slug: record.id,
    created: SEED_CREATED,
    busy: false,
  };
}
