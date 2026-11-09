// Per-document and cross-document validation of the frontmatter contract. The `scope` / `areas`
// vocabularies come from the project taxonomy: declared lists are enforced, absent lists accept any
// value.

import type { DocsTaxonomy } from '../config/docs-settings';
import { asString, KNOWN_STATUSES, KNOWN_TYPES, REQUIRED_FIELDS } from './contract';
import type { DocRecord, DocType } from './contract';

function isKnownType(v: unknown): v is DocType {
  return typeof v === 'string' && (KNOWN_TYPES as string[]).includes(v);
}

function validateStringArray(value: unknown, field: string, loc: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [`${loc}: '${field}' must be a non-empty array of strings`];
  }

  if (value.some((v) => typeof v !== 'string' || !v.trim())) {
    return [`${loc}: '${field}' entries must be non-empty strings`];
  }

  return [];
}

function validateScope(doc: DocRecord, taxonomy: DocsTaxonomy, loc: string): string[] {
  if (doc.scope === undefined) {
    return [];
  }

  if (taxonomy.scopes) {
    return taxonomy.scopes.includes(asString(doc.scope))
      ? []
      : [
          `${loc}: unknown scope '${asString(doc.scope)}' (expected one of: ${taxonomy.scopes.join(', ')})`,
        ];
  }

  return typeof doc.scope === 'string' && doc.scope.trim()
    ? []
    : [`${loc}: 'scope' must be a non-empty string`];
}

function validateAreas(doc: DocRecord, taxonomy: DocsTaxonomy, loc: string): string[] {
  if (doc.areas === undefined) {
    return [];
  }

  const problems = validateStringArray(doc.areas, 'areas', loc);
  const declared = taxonomy.areas;
  if (declared && Array.isArray(doc.areas)) {
    for (const area of doc.areas) {
      if (typeof area === 'string' && !declared.includes(area)) {
        problems.push(`${loc}: unknown area '${area}' (expected one of: ${declared.join(', ')})`);
      }
    }
  }

  return problems;
}

/** Validate one parsed document against the contract. Returns human-readable problems. */
export function validateDoc(doc: DocRecord, taxonomy: DocsTaxonomy = {}): string[] {
  const problems: string[] = [];
  const loc = typeof doc.file === 'string' ? doc.file : asString(doc.id, 'document');

  if (!doc.id) {
    problems.push(`${loc}: missing 'id'`);
  }

  if (!doc.type) {
    problems.push(`${loc}: missing 'type'`);
  }

  if (doc.type !== undefined && !isKnownType(doc.type)) {
    problems.push(
      `${loc}: unknown type '${asString(doc.type)}' (expected one of: ${KNOWN_TYPES.join(', ')})`,
    );
  }

  if (doc.status !== undefined && !(KNOWN_STATUSES as string[]).includes(asString(doc.status))) {
    problems.push(
      `${loc}: unknown status '${asString(doc.status)}' (expected one of: ${KNOWN_STATUSES.join(', ')})`,
    );
  }

  const required = isKnownType(doc.type)
    ? REQUIRED_FIELDS[doc.type]
    : ['id', 'type', 'title', 'status'];
  for (const field of required) {
    const value = doc[field];
    if (value === undefined || value === null || value === '') {
      problems.push(`${loc}: missing required field '${field}' for type '${asString(doc.type)}'`);
    }
  }

  if (doc.read_when !== undefined) {
    problems.push(...validateStringArray(doc.read_when, 'read_when', loc));
  }

  if (doc.related !== undefined && !Array.isArray(doc.related)) {
    problems.push(`${loc}: 'related' must be an array of doc ids`);
  }

  problems.push(...validateScope(doc, taxonomy, loc));
  problems.push(...validateAreas(doc, taxonomy, loc));

  if (doc.tags !== undefined) {
    problems.push(...validateStringArray(doc.tags, 'tags', loc));
    if (Array.isArray(doc.tags)) {
      for (const tag of doc.tags) {
        if (typeof tag === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) {
          problems.push(`${loc}: tag '${tag}' must be lowercase kebab-case`);
        }
      }
    }
  }

  return problems;
}

/** Cross-document validation: unique ids, resolvable `related` / `superseded_by` / `supersedes`. */
export function validateCorpus(docs: readonly DocRecord[]): string[] {
  const problems: string[] = [];
  const byId = new Map<string, string>();

  for (const doc of docs) {
    if (typeof doc.id !== 'string') {
      continue;
    }

    const existing = byId.get(doc.id);
    if (existing) {
      problems.push(`${doc.file}: duplicate id '${doc.id}' (also in ${existing})`);
    } else {
      byId.set(doc.id, doc.file);
    }
  }

  for (const doc of docs) {
    const refs = [
      ...(Array.isArray(doc.related) ? (doc.related as unknown[]) : []),
      ...(doc.superseded_by ? [doc.superseded_by] : []),
      ...(doc.supersedes ? [doc.supersedes] : []),
    ];
    for (const ref of refs) {
      if (typeof ref !== 'string' || !byId.has(ref)) {
        problems.push(`${doc.file}: unresolved reference '${String(ref)}'`);
      }
    }
  }

  return problems;
}
