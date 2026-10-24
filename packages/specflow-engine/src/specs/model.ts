import { CATALOGUE_ID_PATTERN } from '@nevo/specflow-contracts/documents';
import { parse } from 'yaml';

import { isRegisteredDocumentId } from './documents/document-ids';
import {
  ancestorFolders,
  foldPathKey,
  validateDocumentPath,
  validateFolderPath,
} from './documents/document-paths';
import { MANIFEST_MAX_BYTES } from './documents/limits';
import {
  OVERVIEW_DOCUMENT_ID,
  OVERVIEW_DOCUMENT_PATH,
  OVERVIEW_DOCUMENT_TYPE,
  isProtectedDocument,
} from './documents/protection';

export type SpecificationLocation = 'active' | 'archive';

export type SpecificationErrorCode =
  'SPEC_VALIDATION_ERROR' | 'SPEC_SOURCE_INVALID' | 'SPEC_CONFLICT' | 'SPEC_NOT_FOUND';

export class SpecificationError extends Error {
  readonly code: SpecificationErrorCode;

  constructor(code: SpecificationErrorCode, message: string) {
    super(message);
    this.name = 'SpecificationError';
    this.code = code;
  }
}

/** One requirement of the archetype snapshot persisted in the manifest. */
export interface ManifestRequirement {
  readonly documentType: string;
  readonly minCount: number;
}

/** The archetype chosen at Create: id, version and the authoritative requirements snapshot. */
export interface ManifestArchetype {
  readonly id: string;
  readonly version: number;
  readonly requirements: readonly ManifestRequirement[];
}

/** One registry entry: stable id, path relative to the Specification directory and document type id. */
export interface ManifestDocument {
  readonly id: string;
  readonly path: string;
  readonly type: string;
}

/**
 * A manifest is the only authority for canonical Spec metadata, status and the document registry.
 * The generated indexes and the Runtime Overview are projections, never stores.
 */
export interface SpecificationManifest {
  readonly specId: string;
  readonly slug: string;
  readonly title: string;
  readonly archetype: ManifestArchetype;
  readonly documents: readonly ManifestDocument[];
  /** Explicit folders that may hold no file (empty when the manifest declares none). */
  readonly folders: readonly string[];
  readonly status: string;
  readonly location: SpecificationLocation;
  readonly priority?: number;
  readonly created?: string;
  readonly tasks: readonly unknown[];
}

const SPEC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
// Windows device names are reserved even with an extension (e.g. con.txt).
// Reject on every host, not only when running on Windows.
const WINDOWS_DEVICE_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/u;
const CATALOGUE_ID = new RegExp(CATALOGUE_ID_PATTERN, 'u');

export function isValidSpecificationId(value: unknown): value is string {
  return typeof value === 'string' && SPEC_ID_PATTERN.test(value);
}

export function validateSpecificationSlug(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !SLUG_PATTERN.test(value) ||
    value.includes('..') ||
    value.endsWith('.') ||
    WINDOWS_DEVICE_PATTERN.test(value) ||
    value.length > 128
  ) {
    throw new SpecificationError(
      'SPEC_VALIDATION_ERROR',
      'Specification slug must be portable: lowercase ASCII, no traversal, trailing dot or Windows reserved device name.',
    );
  }
  return value;
}

/** Slug a client may request: lowercase kebab-case ASCII (the shape derived slugs already have). */
const EXPLICIT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isExplicitSpecificationSlug(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80 || !EXPLICIT_SLUG_PATTERN.test(value)) {
    return false;
  }
  return !WINDOWS_DEVICE_PATTERN.test(value);
}

export function specificationSlugFromTitle(title: string, specId: string): string {
  const normalized = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/ł/gu, 'l')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80)
    .replace(/-+$/gu, '');
  const candidate = normalized || 'spec-' + specId.slice(0, 8);
  return validateSpecificationSlug(
    WINDOWS_DEVICE_PATTERN.test(candidate) ? candidate + '-' + specId.slice(0, 8) : candidate,
  );
}

/** Keys of each strict manifest object. Unknown top-level keys are tolerated; these are not. */
const ARCHETYPE_KEYS: readonly string[] = ['id', 'version', 'requirements'];
const REQUIREMENT_KEYS: readonly string[] = ['documentType', 'minCount'];
const DOCUMENT_KEYS: readonly string[] = ['id', 'path', 'type'];

/**
 * Parse manifest YAML text: enforces the manifest size limit, then {@link parseSpecificationManifest}.
 * Every failure is `SPEC_SOURCE_INVALID`, names the slug and never carries an absolute path.
 */
export function parseSpecificationManifestText(
  text: string,
  slug: string,
  location: SpecificationLocation,
): SpecificationManifest {
  if (Buffer.byteLength(text, 'utf8') > MANIFEST_MAX_BYTES) {
    throw sourceInvalid(slug, 'manifest', `is larger than ${MANIFEST_MAX_BYTES} bytes`);
  }
  let source: unknown;
  try {
    source = parse(text) as unknown;
  } catch {
    throw sourceInvalid(slug, 'manifest', 'is not valid YAML');
  }
  return parseSpecificationManifest(source, slug, location);
}

/**
 * Strict, fail-closed parse of the canonical Specification manifest (architecture "Manifest schema",
 * parser rules 1 to 7). No alias, no default, no legacy fallback: the old `type` field is not read, and a
 * manifest without `archetype` or `documents` is invalid. Unknown top-level keys are tolerated (and
 * preserved by the serializer); unknown keys inside `archetype`, `documents[]` and `requirements[]` are not.
 */
export function parseSpecificationManifest(
  source: unknown,
  slug: string,
  location: SpecificationLocation,
): SpecificationManifest {
  validateSpecificationSlug(slug);
  if (!isRecord(source)) throw sourceInvalid(slug, 'manifest', 'is not an object');
  if (source.id !== slug) throw sourceInvalid(slug, 'id', 'does not match the directory slug');
  if (!isValidSpecificationId(source.spec_id)) {
    throw sourceInvalid(slug, 'spec_id', 'is missing or not a persisted UUID');
  }
  if (typeof source.title !== 'string' || !source.title.trim()) {
    throw sourceInvalid(slug, 'title', 'must be a non-empty string');
  }
  if (typeof source.status !== 'string' || !source.status.trim()) {
    throw sourceInvalid(slug, 'status', 'must be a non-empty string');
  }
  if (!Array.isArray(source.tasks)) throw sourceInvalid(slug, 'tasks', 'must be an array');
  if (
    source.priority !== undefined &&
    (typeof source.priority !== 'number' || !Number.isFinite(source.priority))
  ) {
    throw sourceInvalid(slug, 'priority', 'must be a finite number');
  }
  if (source.created !== undefined && typeof source.created !== 'string') {
    throw sourceInvalid(slug, 'created', 'must be a string');
  }

  const archetype = parseArchetype(source.archetype, slug);
  const documents = parseDocuments(source.documents, slug);
  const folders = parseFolders(source.folders, documents, slug);
  return {
    specId: source.spec_id,
    slug,
    title: source.title,
    archetype,
    documents,
    folders,
    status: source.status,
    location,
    ...(source.priority !== undefined ? { priority: source.priority } : {}),
    ...(source.created !== undefined ? { created: source.created } : {}),
    tasks: source.tasks,
  };
}

function parseArchetype(value: unknown, slug: string): ManifestArchetype {
  if (value === undefined) throw sourceInvalid(slug, 'archetype', 'is required');
  if (!isRecord(value)) throw sourceInvalid(slug, 'archetype', 'must be an object');
  assertKnownKeys(value, ARCHETYPE_KEYS, 'archetype', slug);
  if (typeof value.id !== 'string' || !CATALOGUE_ID.test(value.id)) {
    throw sourceInvalid(slug, 'archetype.id', 'must be a catalogue id');
  }
  if (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1) {
    throw sourceInvalid(slug, 'archetype.version', 'must be a positive integer');
  }
  if (!Array.isArray(value.requirements)) {
    throw sourceInvalid(slug, 'archetype.requirements', 'is required and must be an array');
  }
  const seen = new Set<string>();
  const requirements = value.requirements.map((entry: unknown, index): ManifestRequirement => {
    const field = `archetype.requirements[${index}]`;
    if (!isRecord(entry)) throw sourceInvalid(slug, field, 'must be an object');
    assertKnownKeys(entry, REQUIREMENT_KEYS, field, slug);
    if (typeof entry.documentType !== 'string' || !CATALOGUE_ID.test(entry.documentType)) {
      throw sourceInvalid(slug, `${field}.documentType`, 'must be a document type id');
    }
    if (
      typeof entry.minCount !== 'number' ||
      !Number.isInteger(entry.minCount) ||
      entry.minCount < 0
    ) {
      throw sourceInvalid(slug, `${field}.minCount`, 'must be an integer of at least 0');
    }
    if (seen.has(entry.documentType)) {
      throw sourceInvalid(slug, `${field}.documentType`, 'is required more than once');
    }
    seen.add(entry.documentType);
    return { documentType: entry.documentType, minCount: entry.minCount };
  });
  const overview = requirements.find((item) => item.documentType === OVERVIEW_DOCUMENT_TYPE);
  if (!overview || overview.minCount < 1) {
    throw sourceInvalid(
      slug,
      'archetype.requirements',
      'must require the overview document type with minCount of at least 1',
    );
  }
  return { id: value.id, version: value.version, requirements };
}

function parseDocuments(value: unknown, slug: string): ManifestDocument[] {
  if (value === undefined) throw sourceInvalid(slug, 'documents', 'is required');
  if (!Array.isArray(value)) throw sourceInvalid(slug, 'documents', 'must be an array');
  const ids = new Set<string>();
  const documents = value.map((entry: unknown, index): ManifestDocument => {
    const field = `documents[${index}]`;
    if (!isRecord(entry)) throw sourceInvalid(slug, field, 'must be an object');
    assertKnownKeys(entry, DOCUMENT_KEYS, field, slug);
    if (typeof entry.id !== 'string' || !isRegisteredDocumentId(entry.id)) {
      throw sourceInvalid(
        slug,
        `${field}.id`,
        'must match the document id pattern and must not start with "u-"',
      );
    }
    if (ids.has(entry.id)) throw sourceInvalid(slug, `${field}.id`, 'is not unique');
    ids.add(entry.id);
    if (typeof entry.type !== 'string' || !CATALOGUE_ID.test(entry.type)) {
      throw sourceInvalid(slug, `${field}.type`, 'must be a document type id');
    }
    if (typeof entry.path !== 'string') {
      throw sourceInvalid(slug, `${field}.path`, 'must be a string');
    }
    const path = validateDocumentPath(entry.path);
    if (!path.ok) {
      throw sourceInvalid(slug, `${field}.path`, `is not a portable path (${path.violation})`);
    }
    return { id: entry.id, path: entry.path, type: entry.type };
  });

  const pathKeys = new Set<string>();
  for (const item of documents) {
    const key = foldPathKey(item.path);
    if (pathKeys.has(key)) {
      throw sourceInvalid(slug, 'documents[].path', `"${item.path}" is not unique ignoring case`);
    }
    pathKeys.add(key);
  }

  // A registered file cannot also be the ancestor folder of another registered file.
  for (const item of documents) {
    for (const ancestor of ancestorFolders(item.path)) {
      if (pathKeys.has(foldPathKey(ancestor))) {
        throw sourceInvalid(
          slug,
          'documents[].path',
          `"${ancestor}" is a registered file and also a folder of "${item.path}"`,
        );
      }
    }
  }

  // Rule 5 (PC-1): exactly one overview entry, with fixed id, path and type.
  const protectedEntries = documents.filter((item) => isProtectedDocument(item));
  const only = protectedEntries[0];
  if (
    protectedEntries.length !== 1 ||
    only?.id !== OVERVIEW_DOCUMENT_ID ||
    only.path !== OVERVIEW_DOCUMENT_PATH ||
    only.type !== OVERVIEW_DOCUMENT_TYPE
  ) {
    throw sourceInvalid(
      slug,
      'documents',
      `must contain exactly one overview entry with id "${OVERVIEW_DOCUMENT_ID}", path "${OVERVIEW_DOCUMENT_PATH}" and type "${OVERVIEW_DOCUMENT_TYPE}"`,
    );
  }
  return documents;
}

function parseFolders(
  value: unknown,
  documents: readonly ManifestDocument[],
  slug: string,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw sourceInvalid(slug, 'folders', 'must be an array');
  const filePaths = new Set(documents.map((item) => foldPathKey(item.path)));
  const seen = new Set<string>();
  return value.map((entry: unknown, index): string => {
    const field = `folders[${index}]`;
    if (typeof entry !== 'string') throw sourceInvalid(slug, field, 'must be a string');
    const path = validateFolderPath(entry);
    if (!path.ok) {
      throw sourceInvalid(slug, field, `is not a portable folder path (${path.violation})`);
    }
    const key = foldPathKey(entry);
    if (seen.has(key)) throw sourceInvalid(slug, field, 'is not unique ignoring case');
    seen.add(key);
    if (filePaths.has(key)) throw sourceInvalid(slug, field, 'equals a registered document path');
    for (const ancestor of ancestorFolders(entry + '/x')) {
      if (filePaths.has(foldPathKey(ancestor))) {
        throw sourceInvalid(slug, field, `is below the registered file "${ancestor}"`);
      }
    }
    return entry;
  });
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
  slug: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw sourceInvalid(slug, `${field}.${unknown}`, 'is not allowed');
}

/** `SPEC_SOURCE_INVALID` naming the slug and the field, never an absolute path. */
function sourceInvalid(slug: string, field: string, problem: string): SpecificationError {
  return new SpecificationError(
    'SPEC_SOURCE_INVALID',
    `Specification "${slug}" manifest: field "${field}" ${problem}.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate a create intent without allocating a speculative specification identity. */
export function validateSpecificationScaffoldInput(input: {
  readonly title: string;
  readonly created: string;
}): void {
  const title = input.title.replace(/\s+/gu, ' ').trim();
  if (!title || title.length > 200) {
    throw new SpecificationError('SPEC_VALIDATION_ERROR', 'Title must be 1 to 200 characters.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.created)) {
    throw new SpecificationError('SPEC_VALIDATION_ERROR', 'Creation date must use YYYY-MM-DD.');
  }
}
