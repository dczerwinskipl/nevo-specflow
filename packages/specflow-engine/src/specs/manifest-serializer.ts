import { isDeepStrictEqual } from 'node:util';

import { parseDocument, stringify } from 'yaml';

import {
  SpecificationError,
  parseSpecificationManifestText,
  type ManifestArchetype,
  type ManifestDocument,
  type SpecificationLocation,
  type SpecificationManifest,
} from './model';

/**
 * Pure manifest serialization ("Rewriting the manifest", ADR 0015). Every function validates its own
 * output through the strict parser before returning it, so a writer can never publish a manifest the
 * reader would refuse. Unknown top-level keys are preserved; comments are preserved by
 * {@link updateManifestRegistry}.
 */

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'id',
  'title',
  'status',
  'priority',
  'created',
  'tasks',
  'spec_id',
  'archetype',
  'documents',
  'folders',
]);

/**
 * Canonical YAML of a manifest model. `preservedTopLevel` carries unknown top-level keys, written after
 * the known ones; known keys in it are ignored. Optional `priority`, `created` and empty `folders` are omitted.
 */
export function serializeSpecificationManifest(
  manifest: SpecificationManifest,
  preservedTopLevel: Readonly<Record<string, unknown>> = {},
): string {
  const text = stringify({
    id: manifest.slug,
    title: manifest.title,
    status: manifest.status,
    ...(manifest.priority !== undefined ? { priority: manifest.priority } : {}),
    ...(manifest.created !== undefined ? { created: manifest.created } : {}),
    tasks: manifest.tasks,
    spec_id: manifest.specId,
    archetype: {
      id: manifest.archetype.id,
      version: manifest.archetype.version,
      requirements: manifest.archetype.requirements.map((item) => ({
        documentType: item.documentType,
        minCount: item.minCount,
      })),
    },
    documents: manifest.documents.map((item) => ({
      id: item.id,
      path: item.path,
      type: item.type,
    })),
    ...(manifest.folders.length > 0 ? { folders: [...manifest.folders] } : {}),
    ...Object.fromEntries(
      Object.entries(preservedTopLevel).filter(([key]) => !KNOWN_TOP_LEVEL_KEYS.has(key)),
    ),
  });
  const reparsed = parseSpecificationManifestText(text, manifest.slug, manifest.location);
  if (!isDeepStrictEqual(reparsed, manifest)) {
    throw new SpecificationError(
      'SPEC_SOURCE_INVALID',
      `Specification "${manifest.slug}" manifest: serialization did not round-trip.`,
    );
  }
  return text;
}

export interface ManifestRegistryUpdate {
  /** Replaces the archetype snapshot when present (not used by document operations). */
  readonly archetype?: ManifestArchetype;
  readonly documents: readonly ManifestDocument[];
  /** Replaces the explicit folders; an empty list removes the key. */
  readonly folders: readonly string[];
}

/**
 * Rewrite only the registry of an existing manifest text: unknown top-level keys, comments and key order
 * are preserved. The result is re-validated through the strict parser and must reproduce the update.
 */
export function updateManifestRegistry(
  sourceText: string,
  slug: string,
  location: SpecificationLocation,
  update: ManifestRegistryUpdate,
): string {
  const document = parseDocument(sourceText);
  if (document.errors.length > 0 || document.contents === null) {
    throw new SpecificationError(
      'SPEC_SOURCE_INVALID',
      `Specification "${slug}" manifest: is not valid YAML.`,
    );
  }
  if (update.archetype !== undefined) {
    document.set('archetype', document.createNode(plainArchetype(update.archetype)));
  }
  document.set('documents', document.createNode(update.documents.map((item) => ({ ...item }))));
  if (update.folders.length > 0) document.set('folders', document.createNode([...update.folders]));
  else document.delete('folders');

  const text = document.toString();
  const reparsed = parseSpecificationManifestText(text, slug, location);
  if (
    !isDeepStrictEqual(reparsed.documents, update.documents) ||
    !isDeepStrictEqual(reparsed.folders, update.folders) ||
    (update.archetype !== undefined && !isDeepStrictEqual(reparsed.archetype, update.archetype))
  ) {
    throw new SpecificationError(
      'SPEC_SOURCE_INVALID',
      `Specification "${slug}" manifest: registry update did not round-trip.`,
    );
  }
  return text;
}

function plainArchetype(archetype: ManifestArchetype): unknown {
  return {
    id: archetype.id,
    version: archetype.version,
    requirements: archetype.requirements.map((item) => ({ ...item })),
  };
}
