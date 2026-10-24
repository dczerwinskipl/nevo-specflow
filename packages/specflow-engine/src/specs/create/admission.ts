import { getBuiltInCatalogue, type ResolvedCatalogue } from '../archetypes/catalogue';
import { DocumentError } from '../documents/errors';
import {
  ScaffoldValidationError,
  createSpecificationScaffold,
  type ScaffoldValidationCause,
} from '../scaffold';
import { CreateOperationError } from './error';
import { sha256Utf8, type CreateClientIntent } from './intent';

/** A syntactically valid UUID: validation of the scaffold never depends on the real specId. */
const ADMISSION_SPEC_ID = '00000000-0000-4000-8000-000000000000';
const ADMISSION_CREATED = '2000-01-01';

/** The archetype reference and catalogue revision a client builds a Create request from. */
export interface ResolvedCreateArchetype {
  readonly archetype: { readonly id: string; readonly version: number };
  readonly catalogueRevision: string;
}

/**
 * The Engine's current version of an archetype and the catalogue revision, for a caller that runs
 * against this very Engine (the CLI). The Engine owns this resolution: an unknown id is refused here
 * as `ARCHETYPE_UNKNOWN`, never answered with an invented version.
 */
export function resolveCreateArchetype(
  archetypeId: string,
  catalogue: ResolvedCatalogue = getBuiltInCatalogue(),
): ResolvedCreateArchetype {
  const archetype = catalogue.findArchetype(archetypeId);
  if (!archetype) {
    throw new DocumentError('ARCHETYPE_UNKNOWN', `Unknown archetype "${archetypeId}".`);
  }
  return {
    archetype: { id: archetype.id, version: archetype.version },
    catalogueRevision: catalogue.revision,
  };
}

/**
 * Admission of the archetype part of a Create. Pure and effect free: it reads only the intent, the
 * added contents and the catalogue, and writes nothing. Throws {@link DocumentError} (never a Create
 * error) so the caller refuses BEFORE any reservation, journal, payload or file exists.
 *
 * Order: a stale revision first (a client holding an old catalogue is told to refresh whatever else
 * it sent), then the archetype and its version, then the scaffold rules (templates, paths, limits).
 */
export function admitCreateArchetype(
  intent: CreateClientIntent,
  addedContents: readonly string[],
  catalogue: ResolvedCatalogue = getBuiltInCatalogue(),
): void {
  if (intent.catalogueRevision !== undefined && intent.catalogueRevision !== catalogue.revision) {
    throw new DocumentError('CATALOGUE_STALE', 'The archetype catalogue changed; reload it.');
  }
  const { archetype } = resolveCreateArchetype(intent.archetype.id, catalogue);
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

/** One to one mapping of the six scaffold causes onto document codes (delivery D2, item 5). */
export function documentErrorOf(error: ScaffoldValidationError): DocumentError {
  return new DocumentError(documentCodeOf(error.cause), error.message);
}

function documentCodeOf(cause: ScaffoldValidationCause) {
  switch (cause.kind) {
    case 'archetype-unknown':
    case 'template-unknown':
      return 'ARCHETYPE_UNKNOWN' as const;
    case 'path-invalid':
      return 'DOCUMENT_PATH_INVALID' as const;
    case 'path-conflict':
      return 'DOCUMENT_PATH_CONFLICT' as const;
    case 'type-invalid':
    case 'content-invalid':
    case 'limit-exceeded':
      return 'DOCUMENT_OPERATION_INVALID' as const;
    default: {
      const exhaustive: never = cause;
      return exhaustive;
    }
  }
}

function assertContentsMatchEvidence(
  intent: CreateClientIntent,
  addedContents: readonly string[],
): void {
  const matches =
    addedContents.length === intent.addedDocuments.length &&
    intent.addedDocuments.every((document, index) => {
      const content = addedContents[index]!;
      return (
        document.bytes === Buffer.byteLength(content, 'utf8') &&
        document.sha256 === sha256Utf8(content)
      );
    });
  if (!matches) {
    throw new CreateOperationError(
      'CREATE_OPERATION_INVALID',
      'Added document contents do not match the request intent.',
    );
  }
}
