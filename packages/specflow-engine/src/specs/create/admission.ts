import type { SpecFlowEngine } from '../../application';
import { getStableProjectCatalogue } from '../definitions/catalogue-source';
import type { ProjectCatalogue } from '../definitions/project-catalogue';
import { requireArchetype } from '../definitions/archetype-lookup';
import { DocumentError } from '../documents';
import { ScaffoldValidationError, createSpecificationScaffold, documentErrorOf } from '../scaffold';
import { CreateOperationError } from './error';
import { type CreateClientIntent } from './intent';
import { sha256Hex } from '../../hash';

/** A syntactically valid UUID: validation of the scaffold never depends on the real specId. */
const ADMISSION_SPEC_ID = '00000000-0000-4000-8000-000000000000';
const ADMISSION_CREATED = '2000-01-01';

/** The archetype reference and catalogue revision a client builds a Create request from. */
export interface ResolvedCreateArchetype {
  readonly archetype: { readonly id: string; readonly version: number };
  readonly catalogueRevision: string;
}

/**
 * The Engine's current version of an archetype and the catalogue revision of the project's
 * definitions, for a caller that runs against this very Engine (the CLI). The Engine owns this
 * resolution: an unknown id is refused here as `ARCHETYPE_UNKNOWN`, never answered with an invented
 * version, and a project without definitions as `DEFINITIONS_MISSING`.
 */
export async function resolveCreateArchetype(
  engine: SpecFlowEngine,
  archetypeId: string,
): Promise<ResolvedCreateArchetype> {
  const project = await getStableProjectCatalogue(engine);
  const archetype = requireArchetype(project, archetypeId);
  return {
    archetype: { id: archetype.id, version: archetype.version },
    catalogueRevision: project.catalogue.revision,
  };
}

/**
 * Admission of the archetype part of a Create. Pure and effect free: it reads only the intent, the
 * added contents and the catalogue, and writes nothing. Throws {@link DocumentError} (never a Create
 * error) so the caller refuses BEFORE any reservation, journal, payload or file exists.
 *
 * Order: no usable archetype at all, then a stale revision (a client holding an old catalogue is told
 * to refresh whatever else it sent), then the archetype and its version, then the scaffold rules
 * (templates, paths, limits).
 */
export function admitCreateArchetype(
  intent: CreateClientIntent,
  addedContents: readonly string[],
  project: ProjectCatalogue,
): void {
  const { catalogue } = project;
  // A project without any usable archetype is reported first: reloading the catalogue would not help.
  if (catalogue.archetypes.length === 0) requireArchetype(project, intent.archetype.id);
  if (intent.catalogueRevision !== undefined && intent.catalogueRevision !== catalogue.revision) {
    throw new DocumentError('CATALOGUE_STALE', 'The archetype catalogue changed; reload it.');
  }
  const archetype = requireArchetype(project, intent.archetype.id);
  if (archetype.version !== intent.archetype.version) {
    throw new DocumentError(
      'CATALOGUE_STALE',
      `Archetype "${archetype.id}" is at version ${archetype.version}, not ${intent.archetype.version}.`,
    );
  }
  assertContentsMatchEvidence(intent, addedContents);
  try {
    createSpecificationScaffold({
      specId: ADMISSION_SPEC_ID,
      title: intent.title,
      created: ADMISSION_CREATED,
      goal: intent.goal,
      slug: intent.slug,
      archetypeId: intent.archetype.id,
      optionalDocumentIds: intent.optionalDocumentIds,
      addedDocuments: intent.addedDocuments.map((document, index) => ({
        path: document.path,
        ...(document.type !== undefined ? { type: document.type } : {}),
        content: addedContents[index] ?? '',
      })),
      folders: intent.folders,
      catalogue,
    });
  } catch (error) {
    if (error instanceof ScaffoldValidationError) throw documentErrorOf(error);
    throw error;
  }
}

function assertContentsMatchEvidence(
  intent: CreateClientIntent,
  addedContents: readonly string[],
): void {
  const matches =
    addedContents.length === intent.addedDocuments.length &&
    intent.addedDocuments.every((document, index) => {
      const content = addedContents[index];
      return (
        content !== undefined &&
        document.bytes === Buffer.byteLength(content, 'utf8') &&
        document.sha256 === sha256Hex(content)
      );
    });
  if (!matches) {
    throw new CreateOperationError(
      'CREATE_OPERATION_INVALID',
      'Added document contents do not match the request intent.',
    );
  }
}
