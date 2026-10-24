import { createHash } from 'node:crypto';

import { CATALOGUE_ID_PATTERN } from '@nevo/specflow-contracts/documents';

import { getBuiltInCatalogue, type ResolvedCatalogue } from './archetypes/catalogue';
import { renderTemplate, templateValues } from './archetypes/template-renderer';
import {
  DocumentError,
  DocumentIdError,
  OVERVIEW_DOCUMENT_TYPE,
  TEMPLATE_TEXT_MAX_BYTES,
  TEXT_CONTENT_MAX_BYTES,
  allocateDocumentId,
  ancestorFolders,
  foldPathKey,
  validateDocumentPath,
  validateFolderPath,
} from './documents';
import {
  ADDED_DOCUMENTS_MAX_FILES,
  ADDED_DOCUMENTS_MAX_FOLDERS,
  ADDED_DOCUMENTS_MAX_TOTAL_BYTES,
  CREATE_SCAFFOLD_FILES_MAX,
} from './create/limits';
import { serializeSpecificationManifest } from './manifest-serializer';
import {
  SpecificationError,
  isExplicitSpecificationSlug,
  isValidSpecificationId,
  specificationSlugFromTitle,
  validateSpecificationScaffoldInput,
  type ManifestDocument,
  type SpecificationManifest,
} from './model';

const CATALOGUE_ID = new RegExp(CATALOGUE_ID_PATTERN, 'u');

/** A file the person adds at Create. Without a `type` it is created unclassified (not registered). */
export interface AddedDocumentInput {
  readonly path: string;
  readonly type?: string;
  readonly content: string;
}

export interface SpecificationScaffoldInput {
  readonly specId: string;
  readonly title: string;
  /** An explicit creation date supplied by the application operation. */
  readonly created: string;
  readonly goal?: string;
  /** Explicit, already validated slug; omitted: derived from the title. */
  readonly slug?: string;
  /** Catalogue archetype id. There is no default: every caller names the archetype. */
  readonly archetypeId: string;
  /** Template ids of the optional (suggested) documents to scaffold. */
  readonly optionalDocumentIds?: readonly string[];
  readonly addedDocuments?: readonly AddedDocumentInput[];
  /** Explicit folders that may stay empty (registered only in the manifest). */
  readonly folders?: readonly string[];
  /** Resolved catalogue; omitted: the built-in catalogue. */
  readonly catalogue?: ResolvedCatalogue;
}

export interface SpecificationScaffoldFile {
  readonly relativePath: string;
  readonly content: string;
  /** Baseline for later admission of known Engine-created dirty files (durable create evidence). */
  readonly sha256: string;
  /** UTF-8 bytes of `content`. */
  readonly bytes: number;
}

export interface SpecificationScaffold {
  readonly specId: string;
  readonly slug: string;
  /** Manifest first, then the archetype's documents in catalogue order, then added documents. */
  readonly files: readonly SpecificationScaffoldFile[];
  /** Registered document ids in registry order. */
  readonly documentIds: readonly string[];
}

/** Why scaffold input was refused. Admission maps each kind to one document error code. */
export type ScaffoldValidationCause =
  | { readonly kind: 'archetype-unknown'; readonly id: string }
  | { readonly kind: 'template-unknown'; readonly id: string }
  | { readonly kind: 'path-invalid'; readonly path: string; readonly violation: string }
  | { readonly kind: 'path-conflict'; readonly path: string }
  | { readonly kind: 'type-invalid'; readonly path: string; readonly type: string }
  | { readonly kind: 'content-invalid'; readonly path: string }
  | {
      readonly kind: 'limit-exceeded';
      readonly limit:
        | 'added-files'
        | 'added-folders'
        | 'added-total-bytes'
        | 'file-bytes'
        | 'template-bytes'
        | 'scaffold-files';
      readonly max: number;
      readonly actual: number;
      readonly path?: string;
    };

/** `SPEC_VALIDATION_ERROR` carrying a structured {@link ScaffoldValidationCause}. */
export class ScaffoldValidationError extends SpecificationError {
  override readonly cause: ScaffoldValidationCause;

  constructor(message: string, cause: ScaffoldValidationCause) {
    super('SPEC_VALIDATION_ERROR', message);
    this.name = 'ScaffoldValidationError';
    this.cause = cause;
  }
}

/**
 * The one mapping of a scaffold refusal onto a document error code, used by Create admission and by
 * the reservation: every cause maps to exactly one code.
 */
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

/**
 * Deterministic, side-effect-free scaffold driven by an archetype. It does not reserve an ID, create
 * files, update a registry or regenerate indexes. Throws {@link ScaffoldValidationError} for unknown
 * archetype or template ids, invalid or conflicting paths and the Create limits.
 */
export function createSpecificationScaffold(
  input: SpecificationScaffoldInput,
): SpecificationScaffold {
  if (!isValidSpecificationId(input.specId)) {
    throw new SpecificationError('SPEC_VALIDATION_ERROR', 'A canonical specId is required.');
  }
  validateSpecificationScaffoldInput({
    title: input.title,
    created: input.created,
    goal: input.goal,
  });
  const title = input.title.replace(/\s+/gu, ' ').trim();
  if (input.slug !== undefined && !isExplicitSpecificationSlug(input.slug)) {
    throw new SpecificationError(
      'SPEC_VALIDATION_ERROR',
      'Specification slug must be lowercase kebab-case ASCII of at most 80 characters.',
    );
  }
  const slug = input.slug ?? specificationSlugFromTitle(title, input.specId);
  const base = 'specs/active/' + slug + '/';

  const catalogue = input.catalogue ?? getBuiltInCatalogue();
  const archetype = catalogue.findArchetype(input.archetypeId);
  if (!archetype) {
    throw new ScaffoldValidationError(`Unknown archetype "${input.archetypeId}".`, {
      kind: 'archetype-unknown',
      id: input.archetypeId,
    });
  }

  const chosen = new Set(input.optionalDocumentIds ?? []);
  for (const id of chosen) {
    const template = archetype.templates.find((item) => item.id === id);
    if (template?.include !== 'optional') {
      throw new ScaffoldValidationError(
        `Archetype "${archetype.id}" has no optional template "${id}".`,
        { kind: 'template-unknown', id },
      );
    }
  }
  const selected = archetype.templates.filter(
    (template) => template.include === 'always' || chosen.has(template.id),
  );

  const values = templateValues({ title, slug, goal: input.goal, created: input.created });
  const documents: ManifestDocument[] = [];
  const files: { path: string; content: string }[] = [];
  const usedIds = new Set<string>();
  const register = (path: string, type: string): void => {
    let id: string;
    try {
      id = allocateDocumentId({
        specId: input.specId,
        type,
        position: documents.length,
        existingIds: usedIds,
      });
    } catch (error) {
      if (error instanceof DocumentIdError) {
        throw new ScaffoldValidationError(`Document type "${type}" cannot be registered.`, {
          kind: 'type-invalid',
          path,
          type,
        });
      }
      throw error;
    }
    usedIds.add(id);
    documents.push({ id, path, type });
  };

  for (const template of selected) {
    const path = checkedPath(template.filename);
    const content = renderTemplate(template.content, values);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > TEMPLATE_TEXT_MAX_BYTES) {
      throw new ScaffoldValidationError(`Rendered template "${template.id}" is too large.`, {
        kind: 'limit-exceeded',
        limit: 'template-bytes',
        max: TEMPLATE_TEXT_MAX_BYTES,
        actual: bytes,
        path,
      });
    }
    register(path, template.documentType);
    files.push({ path, content });
  }

  const added = input.addedDocuments ?? [];
  if (added.length > ADDED_DOCUMENTS_MAX_FILES) {
    throw limit('added-files', ADDED_DOCUMENTS_MAX_FILES, added.length);
  }
  let totalBytes = 0;
  for (const document of added) {
    const path = checkedPath(document.path);
    if (!document.content.isWellFormed()) {
      throw new ScaffoldValidationError(`Added document "${path}" is not well-formed text.`, {
        kind: 'content-invalid',
        path,
      });
    }
    const bytes = Buffer.byteLength(document.content, 'utf8');
    if (bytes > TEXT_CONTENT_MAX_BYTES) {
      throw limit('file-bytes', TEXT_CONTENT_MAX_BYTES, bytes, path);
    }
    totalBytes += bytes;
    if (document.type !== undefined) {
      if (!CATALOGUE_ID.test(document.type) || document.type === OVERVIEW_DOCUMENT_TYPE) {
        throw new ScaffoldValidationError(`Added document "${path}" has an invalid type.`, {
          kind: 'type-invalid',
          path,
          type: document.type,
        });
      }
      register(path, document.type);
    }
    files.push({ path, content: document.content });
  }
  if (totalBytes > ADDED_DOCUMENTS_MAX_TOTAL_BYTES) {
    throw limit('added-total-bytes', ADDED_DOCUMENTS_MAX_TOTAL_BYTES, totalBytes);
  }

  // The manifest is one more file: the journal lists them all and must stay under its cap.
  if (files.length + 1 > CREATE_SCAFFOLD_FILES_MAX) {
    throw limit('scaffold-files', CREATE_SCAFFOLD_FILES_MAX, files.length + 1);
  }

  const requestedFolders = input.folders ?? [];
  if (requestedFolders.length > ADDED_DOCUMENTS_MAX_FOLDERS) {
    throw limit('added-folders', ADDED_DOCUMENTS_MAX_FOLDERS, requestedFolders.length);
  }
  const folders = [...new Set(requestedFolders)].sort(compareFolded);
  for (const folder of folders) {
    const result = validateFolderPath(folder);
    if (!result.ok) throw pathInvalid(folder, result.violation);
  }
  assertNoPathConflicts(
    files.map((file) => file.path),
    folders,
  );

  const manifest: SpecificationManifest = {
    specId: input.specId,
    slug,
    title,
    archetype: {
      id: archetype.id,
      version: archetype.version,
      requirements: archetype.requirements.map((item) => ({
        documentType: item.documentType,
        minCount: item.minCount,
      })),
    },
    documents,
    folders,
    status: 'draft',
    location: 'active',
    priority: 10,
    created: input.created,
    tasks: [],
  };

  return {
    specId: input.specId,
    slug,
    files: [
      fingerprint(base + 'specification.yaml', serializeSpecificationManifest(manifest)),
      ...files.map((file) => fingerprint(base + file.path, file.content)),
    ],
    documentIds: documents.map((item) => item.id),
  };
}

function checkedPath(path: string): string {
  const result = validateDocumentPath(path);
  if (!result.ok) throw pathInvalid(path, result.violation);
  return path;
}

function pathInvalid(path: string, violation: string): ScaffoldValidationError {
  return new ScaffoldValidationError(
    `Path "${path}" is not a valid document path (${violation}).`,
    {
      kind: 'path-invalid',
      path,
      violation,
    },
  );
}

function limit(
  name: Extract<ScaffoldValidationCause, { kind: 'limit-exceeded' }>['limit'],
  max: number,
  actual: number,
  path?: string,
): ScaffoldValidationError {
  return new ScaffoldValidationError(`Create limit exceeded: ${name} (${actual} above ${max}).`, {
    kind: 'limit-exceeded',
    limit: name,
    max,
    actual,
    ...(path !== undefined ? { path } : {}),
  });
}

/** Case-insensitive conflicts among scaffold file paths and folders, and files used as folders. */
function assertNoPathConflicts(filePaths: readonly string[], folders: readonly string[]): void {
  const seen = new Set<string>();
  for (const path of filePaths) {
    const key = foldPathKey(path);
    if (seen.has(key)) throw conflict(path);
    seen.add(key);
  }
  const folderKeys = new Set<string>();
  for (const folder of folders) {
    const key = foldPathKey(folder);
    if (folderKeys.has(key)) throw conflict(folder);
    folderKeys.add(key);
  }
  // Every folder implied by a file path or by an explicit folder is a folder, so no file may use it.
  for (const path of filePaths) {
    for (const ancestor of ancestorFolders(path)) folderKeys.add(foldPathKey(ancestor));
  }
  for (const folder of folders) {
    for (const ancestor of ancestorFolders(folder + '/x')) folderKeys.add(foldPathKey(ancestor));
  }
  for (const path of filePaths) {
    if (folderKeys.has(foldPathKey(path))) throw conflict(path);
  }
}

function conflict(path: string): ScaffoldValidationError {
  return new ScaffoldValidationError(`Path "${path}" conflicts with another path ignoring case.`, {
    kind: 'path-conflict',
    path,
  });
}

function compareFolded(left: string, right: string): number {
  const a = foldPathKey(left);
  const b = foldPathKey(right);
  if (a !== b) return a < b ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function fingerprint(relativePath: string, content: string): SpecificationScaffoldFile {
  return {
    relativePath,
    content,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(content, 'utf8'),
  };
}
