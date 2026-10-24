import { createHash } from 'node:crypto';

import {
  ArchetypeDefinitionFileSchema,
  findDefinitionTextLimitViolations,
  type ArchetypeDefinition,
  type ArchetypeDefinitionFile,
  type DocumentTypeDefinition,
  type TemplateDefinition,
} from '@nevo/specflow-contracts/documents';
import { Value } from 'typebox/value';

import {
  DERIVED_ID_PREFIX,
  OVERVIEW_DOCUMENT_ID,
  OVERVIEW_DOCUMENT_PATH,
  OVERVIEW_DOCUMENT_TYPE,
  foldPathKey,
  validateDocumentPath,
} from '../documents';
import { BUILT_IN_DEFINITIONS } from './builtins';

/**
 * The resolved catalogue: built-in definitions plus (later) user definitions,
 * validated as a whole. There is no loader; `userDefinitions` is only a typed parameter.
 */
export interface ResolvedCatalogue {
  /** sha256 of the canonical JSON of the whole resolved catalogue; changes on any edit. */
  readonly revision: string;
  readonly documentTypes: readonly DocumentTypeDefinition[];
  readonly archetypes: readonly ArchetypeDefinition[];
  findDocumentType(id: string): DocumentTypeDefinition | undefined;
  findArchetype(id: string): ArchetypeDefinition | undefined;
  /** The template of an archetype by template id (what `optionalDocumentIds` names). */
  findTemplate(archetypeId: string, templateId: string): TemplateDefinition | undefined;
}

export class CatalogueDefinitionError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid archetype catalogue: ${issues.join('; ')}`);
    this.name = 'CatalogueDefinitionError';
    this.issues = issues;
  }
}

/**
 * Catalogue-wide checks the declarative schema cannot express, after the schema and the exact UTF-8
 * byte limits. Returns every issue found (empty: valid). Takes the already merged definitions.
 */
export function findCatalogueIssues(definitions: ArchetypeDefinitionFile): string[] {
  const schemaIssues = [...Value.Errors(ArchetypeDefinitionFileSchema, definitions)].map(
    (error) => `schema ${error.instancePath || '/'}: ${error.message}`,
  );
  if (schemaIssues.length > 0) return schemaIssues;

  const issues = findDefinitionTextLimitViolations(definitions).map(
    (violation) =>
      `${violation.path} is ${violation.actualBytes} bytes, above the ${violation.limitBytes} byte limit`,
  );
  const types = definitions.documentTypes ?? [];
  const archetypes = definitions.archetypes ?? [];

  const typeIds = new Set<string>();
  for (const type of types) {
    if (typeIds.has(type.id)) issues.push(`duplicate document type id "${type.id}"`);
    typeIds.add(type.id);
    if (type.id === 'u' || type.id.startsWith(DERIVED_ID_PREFIX)) {
      issues.push(`document type id "${type.id}" is in the reserved "u-" space`);
    }
    if (type.defaultFilename !== undefined && !validateDocumentPath(type.defaultFilename).ok) {
      issues.push(`document type "${type.id}" has an invalid defaultFilename`);
    }
  }
  if (!typeIds.has(OVERVIEW_DOCUMENT_TYPE)) issues.push('document type "overview" is missing');

  const archetypeIds = new Set<string>();
  for (const archetype of archetypes) {
    if (archetypeIds.has(archetype.id)) {
      // Implies a duplicate (id, version) pair as well: one definition per id.
      issues.push(`duplicate archetype id "${archetype.id}"`);
    }
    archetypeIds.add(archetype.id);
    issues.push(...archetypeIssues(archetype, typeIds));
  }
  return issues;
}

function archetypeIssues(archetype: ArchetypeDefinition, typeIds: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const at = `archetype "${archetype.id}"`;

  const required = new Set<string>();
  for (const requirement of archetype.requirements) {
    if (required.has(requirement.documentType)) {
      issues.push(`${at} requires document type "${requirement.documentType}" more than once`);
    }
    required.add(requirement.documentType);
    if (!typeIds.has(requirement.documentType)) {
      issues.push(`${at} requires unknown document type "${requirement.documentType}"`);
    }
  }

  const templateIds = new Set<string>();
  const filenames = new Set<string>();
  for (const template of archetype.templates) {
    if (templateIds.has(template.id))
      issues.push(`${at} has duplicate template id "${template.id}"`);
    templateIds.add(template.id);
    if (template.id.startsWith(DERIVED_ID_PREFIX)) {
      issues.push(`${at} template id "${template.id}" is in the reserved "u-" space`);
    }
    if (!typeIds.has(template.documentType)) {
      issues.push(
        `${at} template "${template.id}" uses unknown document type "${template.documentType}"`,
      );
    }
    const path = validateDocumentPath(template.filename);
    if (!path.ok) {
      issues.push(`${at} template "${template.id}" has an invalid filename (${path.violation})`);
    }
    const key = foldPathKey(template.filename);
    if (filenames.has(key)) {
      issues.push(
        `${at} has templates with the same filename ignoring case "${template.filename}"`,
      );
    }
    filenames.add(key);
  }

  const overview = archetype.templates.filter((template) => template.id === OVERVIEW_DOCUMENT_ID);
  const only = overview.length === 1 ? overview[0] : undefined;
  if (
    only?.documentType !== OVERVIEW_DOCUMENT_TYPE ||
    only.filename !== OVERVIEW_DOCUMENT_PATH ||
    only.include !== 'always'
  ) {
    issues.push(
      `${at} must have exactly one "overview" template of type overview, filename ${OVERVIEW_DOCUMENT_PATH} and include always`,
    );
  }
  return issues;
}

/**
 * Resolve the catalogue from the built-in definitions and optional user definitions: validated as a
 * whole (duplicates between the two are errors; there is no override). Throws
 * {@link CatalogueDefinitionError} listing every issue.
 */
export function resolveCatalogue(
  builtIns: ArchetypeDefinitionFile = BUILT_IN_DEFINITIONS,
  userDefinitions?: ArchetypeDefinitionFile,
): ResolvedCatalogue {
  const merged: ArchetypeDefinitionFile = {
    schemaVersion: 1,
    documentTypes: [...(builtIns.documentTypes ?? []), ...(userDefinitions?.documentTypes ?? [])],
    archetypes: [...(builtIns.archetypes ?? []), ...(userDefinitions?.archetypes ?? [])],
  };
  const issues = findCatalogueIssues(merged);
  if (issues.length > 0) throw new CatalogueDefinitionError(issues);

  const documentTypes = deepFreeze(structuredClone(merged.documentTypes ?? []));
  const archetypes = deepFreeze(structuredClone(merged.archetypes ?? []));
  const revision = catalogueRevisionOf({ documentTypes, archetypes });
  return {
    revision,
    documentTypes,
    archetypes,
    findDocumentType: (id) => documentTypes.find((type) => type.id === id),
    findArchetype: (id) => archetypes.find((archetype) => archetype.id === id),
    findTemplate: (archetypeId, templateId) =>
      archetypes
        .find((archetype) => archetype.id === archetypeId)
        ?.templates.find((template) => template.id === templateId),
  };
}

/** sha256 (hex) of the canonical JSON (sorted object keys, array order kept) of the catalogue content. */
export function catalogueRevisionOf(content: {
  readonly documentTypes: readonly DocumentTypeDefinition[];
  readonly archetypes: readonly ArchetypeDefinition[];
}): string {
  return createHash('sha256').update(canonicalJson(content), 'utf8').digest('hex');
}

let builtInCatalogue: ResolvedCatalogue | undefined;

/** The built-in catalogue (resolved once; the definitions are immutable). */
export function getBuiltInCatalogue(): ResolvedCatalogue {
  builtInCatalogue ??= resolveCatalogue();
  return builtInCatalogue;
}

/** Revision of the built-in catalogue. */
export function catalogueRevision(): string {
  return getBuiltInCatalogue().revision;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}
