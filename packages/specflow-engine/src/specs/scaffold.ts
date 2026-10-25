import { CATALOGUE_ID_PATTERN, type DocumentErrorCode } from '@nevo/specflow-contracts/documents';

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
import { sha256Hex } from '../hash';

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
  | {
      readonly kind: 'path-too-long';
      readonly path: string;
      readonly max: number;
      readonly actual: number;
    }
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
 * the reservation: every cause maps to exactly one code. A `limit-exceeded` and a `type-invalid`
 * cause share a code and stay distinguishable by their message.
 */
const DOCUMENT_CODE_BY_CAUSE: Record<ScaffoldValidationCause['kind'], DocumentErrorCode> = {
  'archetype-unknown': 'ARCHETYPE_UNKNOWN',
  'template-unknown': 'ARCHETYPE_UNKNOWN',
  'path-invalid': 'DOCUMENT_PATH_INVALID',
  'path-too-long': 'DOCUMENT_PATH_INVALID',
  'path-conflict': 'DOCUMENT_PATH_CONFLICT',
  'type-invalid': 'DOCUMENT_OPERATION_INVALID',
  'content-invalid': 'DOCUMENT_OPERATION_INVALID',
  'limit-exceeded': 'DOCUMENT_OPERATION_INVALID',
};

export function documentErrorOf(error: ScaffoldValidationError): DocumentError {
  const code = DOCUMENT_CODE_BY_CAUSE[error.cause.kind];
  return error.cause.kind === 'path-too-long'
    ? new DocumentError(code, error.message, { cause: 'path-too-long' })
    : new DocumentError(code, error.message);
}

/** The registry being built: allocates each document id from its position and the ids already used. */
class DocumentRegistry {
  private readonly specId: string;
  private readonly usedIds = new Set<string>();
  readonly documents: ManifestDocument[] = [];

  constructor(specId: string) {
    this.specId = specId;
  }

  register(path: string, type: string): void {
    let id: string;
    try {
      id = allocateDocumentId({
        specId: this.specId,
        type,
        position: this.documents.length,
        existingIds: this.usedIds,
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
    this.usedIds.add(id);
    this.documents.push({ id, path, type });
  }
}

interface ScaffoldSource {
  readonly path: string;
  readonly content: string;
}

type Archetype = NonNullable<ReturnType<ResolvedCatalogue['findArchetype']>>;

/**
 * Deterministic, side-effect-free scaffold driven by an archetype. It does not reserve an ID, create
 * files, update a registry or regenerate indexes. Throws {@link ScaffoldValidationError} for unknown
 * archetype or template ids, invalid or conflicting paths and the Create limits. The pipeline runs
 * the steps in the order that decides which refusal a request with several problems gets.
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

  const archetype = (input.catalogue ?? getBuiltInCatalogue()).findArchetype(input.archetypeId);
  if (!archetype) {
    throw new ScaffoldValidationError(`Unknown archetype "${input.archetypeId}".`, {
      kind: 'archetype-unknown',
      id: input.archetypeId,
    });
  }

  const registry = new DocumentRegistry(input.specId);
  const templates = selectTemplates(archetype, input.optionalDocumentIds ?? []);
  const values = templateValues({ title, slug, goal: input.goal, created: input.created });
  const files = [
    ...renderArchetypeFiles(registry, templates, values),
    ...admitAddedDocuments(registry, input.addedDocuments ?? []),
  ];
  admitScaffoldFileCount(files);
  const folders = admitFolders(files, input.folders ?? []);

  const manifest = buildManifest(input, {
    title,
    slug,
    archetype,
    documents: registry.documents,
    folders,
  });
  const base = 'specs/active/' + slug + '/';
  return {
    specId: input.specId,
    slug,
    files: [
      fingerprint(base + 'specification.yaml', serializeSpecificationManifest(manifest)),
      ...files.map((file) => fingerprint(base + file.path, file.content)),
    ],
    documentIds: registry.documents.map((item) => item.id),
  };
}

/** The always-included templates plus the chosen optional ones, in catalogue order. */
function selectTemplates(
  archetype: Archetype,
  optionalDocumentIds: readonly string[],
): Archetype['templates'] {
  const chosen = new Set(optionalDocumentIds);
  for (const id of chosen) {
    const template = archetype.templates.find((item) => item.id === id);
    if (template?.include !== 'optional') {
      throw new ScaffoldValidationError(
        `Archetype "${archetype.id}" has no optional template "${id}".`,
        { kind: 'template-unknown', id },
      );
    }
  }
  return archetype.templates.filter(
    (template) => template.include === 'always' || chosen.has(template.id),
  );
}

/** Render and register the archetype's documents. */
function renderArchetypeFiles(
  registry: DocumentRegistry,
  templates: Archetype['templates'],
  values: ReturnType<typeof templateValues>,
): ScaffoldSource[] {
  const files: ScaffoldSource[] = [];
  for (const template of templates) {
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
    registry.register(path, template.documentType);
    files.push({ path, content });
  }
  return files;
}

/** Admit the files the person adds: well-formed, within the limits, registered when typed. */
function admitAddedDocuments(
  registry: DocumentRegistry,
  added: readonly AddedDocumentInput[],
): ScaffoldSource[] {
  if (added.length > ADDED_DOCUMENTS_MAX_FILES) {
    throw limit('added-files', ADDED_DOCUMENTS_MAX_FILES, added.length);
  }
  const files: ScaffoldSource[] = [];
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
      registry.register(path, document.type);
    }
    files.push({ path, content: document.content });
  }
  if (totalBytes > ADDED_DOCUMENTS_MAX_TOTAL_BYTES) {
    throw limit('added-total-bytes', ADDED_DOCUMENTS_MAX_TOTAL_BYTES, totalBytes);
  }
  return files;
}

/** The manifest is one more file: the journal lists them all and must stay under its cap. */
function admitScaffoldFileCount(files: readonly ScaffoldSource[]): void {
  if (files.length + 1 > CREATE_SCAFFOLD_FILES_MAX) {
    throw limit('scaffold-files', CREATE_SCAFFOLD_FILES_MAX, files.length + 1);
  }
}

/** Explicit folders: bounded, valid, unique ignoring case and not in conflict with any file. */
function admitFolders(
  files: readonly ScaffoldSource[],
  requestedFolders: readonly string[],
): string[] {
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
  return folders;
}

function buildManifest(
  input: SpecificationScaffoldInput,
  parts: {
    readonly title: string;
    readonly slug: string;
    readonly archetype: Archetype;
    readonly documents: readonly ManifestDocument[];
    readonly folders: readonly string[];
  },
): SpecificationManifest {
  const { archetype } = parts;
  return {
    specId: input.specId,
    slug: parts.slug,
    title: parts.title,
    archetype: {
      id: archetype.id,
      version: archetype.version,
      requirements: archetype.requirements.map((item) => ({
        documentType: item.documentType,
        minCount: item.minCount,
      })),
    },
    documents: [...parts.documents],
    folders: [...parts.folders],
    status: 'draft',
    location: 'active',
    priority: 10,
    created: input.created,
    tasks: [],
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
    sha256: sha256Hex(content),
    bytes: Buffer.byteLength(content, 'utf8'),
  };
}
