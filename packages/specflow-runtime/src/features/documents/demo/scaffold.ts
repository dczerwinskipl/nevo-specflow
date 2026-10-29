import type { AddedDocument } from '@nevo/specflow-contracts/documents';
import {
  ScaffoldValidationError,
  createSpecificationScaffold,
  documentErrorOf,
  type ResolvedCatalogue,
} from '@nevo/specflow-engine';
import { sha256, textFile, type DemoFile, type DemoSpecDocuments } from './model';
import { archetypeSnapshot } from './seed';

export interface DemoScaffoldInput {
  /** Demo Specification id; the canonical UUID the Engine allocates ids from is derived from it. */
  readonly specId: string;
  readonly title: string;
  readonly goal?: string;
  readonly slug: string;
  /** `YYYY-MM-DD`. */
  readonly created: string;
  readonly archetypeId: string;
  readonly optionalDocumentIds?: readonly string[];
  readonly addedDocuments?: readonly AddedDocument[];
  readonly folders?: readonly string[];
}

/** A stable UUID (version 4 layout) for a demo id: the Engine allocates later ids from it. */
function canonicalId(specId: string): string {
  const hex = sha256('demo-spec:' + specId);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * The document directory a Create produces, built by the Engine's own scaffold (template selection,
 * rendering, id allocation, path rules and Create limits). Throws the Engine's `DocumentError`
 * (`ARCHETYPE_UNKNOWN`, `DOCUMENT_PATH_INVALID`, `DOCUMENT_PATH_CONFLICT`,
 * `DOCUMENT_OPERATION_INVALID`) or its `SpecificationError` for an invalid title or slug. Pure:
 * calling it only to validate a request is safe.
 */
export function scaffoldDocuments(
  catalogue: ResolvedCatalogue,
  input: DemoScaffoldInput,
): { documents: DemoSpecDocuments; documentIds: string[] } {
  const allocationId = canonicalId(input.specId);
  let scaffold;
  try {
    scaffold = createSpecificationScaffold({
      specId: allocationId,
      title: input.title,
      created: input.created,
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
      slug: input.slug,
      archetypeId: input.archetypeId,
      optionalDocumentIds: input.optionalDocumentIds ?? [],
      addedDocuments: input.addedDocuments ?? [],
      folders: input.folders ?? [],
      catalogue,
    });
  } catch (error) {
    if (error instanceof ScaffoldValidationError) throw documentErrorOf(error);
    throw error;
  }
  const base = 'specs/active/' + scaffold.slug + '/';
  const files = new Map<string, DemoFile>(
    // The first scaffold file is the manifest, which is not a document.
    scaffold.files
      .slice(1)
      .map((file) => [file.relativePath.slice(base.length), textFile(file.content)] as const),
  );
  // Registry order is the scaffold's: the chosen templates in catalogue order, then typed additions.
  const chosen = new Set(input.optionalDocumentIds ?? []);
  const archetype = catalogue.findArchetype(input.archetypeId)!;
  const registered = [
    ...archetype.templates
      .filter((template) => template.include === 'always' || chosen.has(template.id))
      .map((template) => ({ path: template.filename, type: template.documentType })),
    ...(input.addedDocuments ?? []).flatMap((document) =>
      document.type !== undefined ? [{ path: document.path, type: document.type }] : [],
    ),
  ];
  if (registered.length !== scaffold.documentIds.length)
    throw new Error('The demo registry does not match the Engine scaffold.');
  return {
    documents: {
      ...archetypeSnapshot(catalogue, input.archetypeId),
      registry: registered.map((entry, index) => ({ ...entry, id: scaffold.documentIds[index]! })),
      folders: [...new Set(input.folders ?? [])],
      files,
      location: 'active',
      allocationId,
      title: input.title.replace(/\s+/gu, ' ').trim(),
      slug: scaffold.slug,
      created: input.created,
      busy: false,
    },
    documentIds: [...scaffold.documentIds],
  };
}
