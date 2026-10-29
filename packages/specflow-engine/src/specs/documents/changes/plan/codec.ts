import { CATALOGUE_ID_PATTERN, DOCUMENT_ID_PATTERN } from '@nevo/specflow-contracts/documents';

import { sha256Hex } from '../../../../hash';
import { exactKeys, isRecord } from '../../../durable/guards';
import { validateDocumentPath, validateFolderPath } from '../../../document-rules';
import { isExplicitSpecificationSlug } from '../../../model';
import { documentChangeError } from '../errors';
import { DOCUMENT_BATCH_MAX_PATHS, DOCUMENT_PLAN_MAX_BYTES } from '../limits';
import {
  DOCUMENT_CHANGE_ACTIONS,
  DOCUMENT_CHANGE_PLAN_VERSION,
  PLANNED_PATH_ROLES,
  manifestPathOf,
  type DocumentChangeAction,
  type DocumentChangePlan,
  type FileState,
  type PathSource,
  type PlannedDocument,
  type PlannedPath,
  type PlannedRegistry,
  type PlannedTemplate,
} from './model';

const SHA256 = /^[0-9a-f]{64}$/u;
const SPEC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const DOCUMENT_ID = new RegExp(DOCUMENT_ID_PATTERN, 'u');
const DERIVED_ID = /^u-[0-9a-f]{32}$/u;
const CATALOGUE_ID = new RegExp(CATALOGUE_ID_PATTERN, 'u');

/** The evidence a journal keeps of a plan file: its hash (the payload key) and its size. */
export interface PlanEvidence {
  readonly sha256: string;
  readonly bytes: number;
}

export interface EncodedPlan extends PlanEvidence {
  /** Canonical JSON; also the content to store under `sha256` in the payload store. */
  readonly text: string;
}

/**
 * Canonical encoding of a plan (fixed key order, no whitespace). The text is validated by the
 * decoder before it is returned, so a writer can never store a plan the reader would refuse.
 */
export function encodePlan(plan: DocumentChangePlan): EncodedPlan {
  const text = JSON.stringify(canonicalPlan(plan));
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > DOCUMENT_PLAN_MAX_BYTES) {
    throw documentChangeError('plan-invalid', 'Plan too large.');
  }

  decodePlan(text);

  return { text, sha256: sha256Hex(text), bytes };
}

/** Strict decode of a plan file's text. Any violation is `plan-invalid`. */
export function decodePlan(text: string): DocumentChangePlan {
  if (Buffer.byteLength(text, 'utf8') > DOCUMENT_PLAN_MAX_BYTES) {
    throw invalid();
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid();
  }

  return validatePlan(value);
}

/** Decodes a stored plan and proves it is the one the evidence names. */
export function decodePlanWithEvidence(text: string, evidence: PlanEvidence): DocumentChangePlan {
  if (Buffer.byteLength(text, 'utf8') !== evidence.bytes || sha256Hex(text) !== evidence.sha256) {
    throw invalid();
  }

  return decodePlan(text);
}

function invalid(): Error {
  return documentChangeError('plan-invalid', 'The document change plan is unreadable.');
}

function canonicalPlan(plan: DocumentChangePlan): Record<string, unknown> {
  return {
    version: plan.version,
    action: plan.action,
    specId: plan.specId,
    slug: plan.slug,
    directory: plan.directory,
    paths: plan.paths.map((path) => ({
      path: path.path,
      role: path.role,
      pre: canonicalState(path.pre),
      post: canonicalState(path.post),
      source: canonicalSource(path.source),
    })),
    documents: plan.documents.map((document) => ({
      id: document.id,
      path: document.path,
      ...(document.type !== undefined ? { type: document.type } : {}),
      sha256: document.sha256,
      bytes: document.bytes,
    })),
    removedDocumentIds: [...plan.removedDocumentIds],
    folders: [...plan.folders],
    allocatedIds: [...plan.allocatedIds],
    templates: plan.templates.map((template) => ({
      path: template.path,
      templateId: template.templateId,
      sha256: template.sha256,
    })),
    ...(plan.registry !== undefined
      ? {
          registry: {
            documents: plan.registry.documents.map((entry) => ({
              id: entry.id,
              path: entry.path,
              type: entry.type,
            })),
            folders: [...plan.registry.folders],
          },
        }
      : {}),
    ...(plan.removedFolder !== undefined ? { removedFolder: plan.removedFolder } : {}),
  };
}

function canonicalState(state: FileState): unknown {
  return state === null ? null : { sha256: state.sha256, bytes: state.bytes };
}

function canonicalSource(source: PathSource): unknown {
  return source.kind === 'moved-from'
    ? { kind: source.kind, path: source.path }
    : { kind: source.kind };
}

const PLAN_KEYS = [
  'version',
  'action',
  'specId',
  'slug',
  'directory',
  'paths',
  'documents',
  'removedDocumentIds',
  'folders',
  'allocatedIds',
  'templates',
  'registry',
  'removedFolder',
] as const;

function validatePlan(value: unknown): DocumentChangePlan {
  if (!isRecord(value) || !exactKeys(value, PLAN_KEYS, ['registry', 'removedFolder'])) {
    throw invalid();
  }

  if (
    value.version !== DOCUMENT_CHANGE_PLAN_VERSION ||
    !isAction(value.action) ||
    typeof value.specId !== 'string' ||
    !SPEC_ID.test(value.specId) ||
    !isExplicitSpecificationSlug(value.slug) ||
    value.directory !== 'specs/active/' + value.slug
  ) {
    throw invalid();
  }

  const directory = value.directory;
  const paths = validatePaths(value.paths, directory);
  const documents = validateDocuments(value.documents);
  const removed = validateIds(value.removedDocumentIds);
  const allocated = validateIds(value.allocatedIds);
  const folders = validateFolders(value.folders);
  const templates = validateTemplates(value.templates);
  const registry = value.registry === undefined ? undefined : validateRegistry(value.registry);
  const removedFolder =
    value.removedFolder === undefined ? undefined : validateFolders([value.removedFolder])[0];
  const hasManifest = paths.some((path) => path.role === 'manifest');
  if (hasManifest !== (registry !== undefined)) {
    throw invalid();
  }

  const plan: DocumentChangePlan = {
    version: DOCUMENT_CHANGE_PLAN_VERSION,
    action: value.action,
    specId: value.specId,
    slug: value.slug,
    directory,
    paths,
    documents,
    removedDocumentIds: removed,
    folders,
    allocatedIds: allocated,
    templates,
    ...(registry !== undefined ? { registry } : {}),
    ...(removedFolder !== undefined ? { removedFolder } : {}),
  };
  // The canonical form is the only accepted form: a hand-edited plan that reorders keys is refused.
  if (JSON.stringify(canonicalPlan(plan)) !== JSON.stringify(value)) {
    throw invalid();
  }

  return plan;
}

function isAction(value: unknown): value is DocumentChangeAction {
  return (
    typeof value === 'string' && (DOCUMENT_CHANGE_ACTIONS as readonly string[]).includes(value)
  );
}

function validatePaths(value: unknown, directory: string): PlannedPath[] {
  if (!Array.isArray(value) || value.length > DOCUMENT_BATCH_MAX_PATHS) {
    throw invalid();
  }

  const seen = new Set<string>();
  const manifest = manifestPathOf({ directory });
  const result = (value as unknown[]).map((entry, index): PlannedPath => {
    if (!isRecord(entry) || !exactKeys(entry, ['path', 'role', 'pre', 'post', 'source'])) {
      throw invalid();
    }

    const role = entry.role;
    if (
      typeof entry.path !== 'string' ||
      typeof role !== 'string' ||
      !(PLANNED_PATH_ROLES as readonly string[]).includes(role)
    ) {
      throw invalid();
    }

    if (role === 'manifest') {
      if (entry.path !== manifest || index !== value.length - 1) {
        throw invalid();
      }
    } else if (
      !entry.path.startsWith(directory + '/') ||
      !validateDocumentPath(entry.path.slice(directory.length + 1)).ok
    ) {
      throw invalid();
    }

    if (seen.has(entry.path)) {
      throw invalid();
    }

    seen.add(entry.path);
    const pre = validateState(entry.pre);
    const post = validateState(entry.post);
    const source = validateSource(entry.source, post, directory);

    return { path: entry.path, role: role as PlannedPath['role'], pre, post, source };
  });
  for (const path of result) {
    if (path.source.kind !== 'moved-from') {
      continue;
    }

    const originPath = path.source.path;
    const origin = result.find((candidate) => candidate.path === originPath);
    // The origin is removed by the same plan and holds exactly the bytes that move.
    if (
      origin?.post !== null ||
      origin.pre === null ||
      path.post === null ||
      !sameState(origin.pre, path.post)
    ) {
      throw invalid();
    }
  }

  return result;
}

function sameState(left: NonNullable<FileState>, right: NonNullable<FileState>): boolean {
  return left.sha256 === right.sha256 && left.bytes === right.bytes;
}

function validateState(value: unknown): FileState {
  if (value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    !exactKeys(value, ['sha256', 'bytes']) ||
    typeof value.sha256 !== 'string' ||
    !SHA256.test(value.sha256) ||
    typeof value.bytes !== 'number' ||
    !Number.isInteger(value.bytes) ||
    value.bytes < 0
  ) {
    throw invalid();
  }

  return { sha256: value.sha256, bytes: value.bytes };
}

function validateSource(value: unknown, post: FileState, directory: string): PathSource {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw invalid();
  }

  switch (value.kind) {
    case 'payload':
      if (!exactKeys(value, ['kind']) || post === null) {
        throw invalid();
      }

      return { kind: 'payload' };
    case 'none':
      if (!exactKeys(value, ['kind']) || post !== null) {
        throw invalid();
      }

      return { kind: 'none' };
    case 'moved-from':
      if (
        !exactKeys(value, ['kind', 'path']) ||
        post === null ||
        typeof value.path !== 'string' ||
        !value.path.startsWith(directory + '/')
      ) {
        throw invalid();
      }

      return { kind: 'moved-from', path: value.path };
    default:
      throw invalid();
  }
}

function validateDocuments(value: unknown): PlannedDocument[] {
  if (!Array.isArray(value) || value.length > DOCUMENT_BATCH_MAX_PATHS) {
    throw invalid();
  }

  return (value as unknown[]).map((entry): PlannedDocument => {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ['id', 'path', 'type', 'sha256', 'bytes'], ['type'])
    ) {
      throw invalid();
    }

    const state = validateState({ sha256: entry.sha256, bytes: entry.bytes });
    if (
      typeof entry.id !== 'string' ||
      !(DOCUMENT_ID.test(entry.id) || DERIVED_ID.test(entry.id)) ||
      typeof entry.path !== 'string' ||
      !validateDocumentPath(entry.path).ok ||
      (entry.type !== undefined &&
        (typeof entry.type !== 'string' || !CATALOGUE_ID.test(entry.type))) ||
      state === null
    ) {
      throw invalid();
    }

    return {
      id: entry.id,
      path: entry.path,
      ...(entry.type !== undefined ? { type: entry.type } : {}),
      sha256: state.sha256,
      bytes: state.bytes,
    };
  });
}

function validateIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > DOCUMENT_BATCH_MAX_PATHS ||
    !value.every(
      (id: unknown) => typeof id === 'string' && (DOCUMENT_ID.test(id) || DERIVED_ID.test(id)),
    )
  ) {
    throw invalid();
  }

  return [...(value as string[])];
}

function validateFolders(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > DOCUMENT_BATCH_MAX_PATHS ||
    !value.every((folder: unknown) => typeof folder === 'string' && validateFolderPath(folder).ok)
  ) {
    throw invalid();
  }

  return [...(value as string[])];
}

function validateTemplates(value: unknown): PlannedTemplate[] {
  if (!Array.isArray(value) || value.length > DOCUMENT_BATCH_MAX_PATHS) {
    throw invalid();
  }

  return (value as unknown[]).map((entry): PlannedTemplate => {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ['path', 'templateId', 'sha256']) ||
      typeof entry.path !== 'string' ||
      !validateDocumentPath(entry.path).ok ||
      typeof entry.templateId !== 'string' ||
      !CATALOGUE_ID.test(entry.templateId) ||
      typeof entry.sha256 !== 'string' ||
      !SHA256.test(entry.sha256)
    ) {
      throw invalid();
    }

    return { path: entry.path, templateId: entry.templateId, sha256: entry.sha256 };
  });
}

function validateRegistry(value: unknown): PlannedRegistry {
  if (!isRecord(value) || !exactKeys(value, ['documents', 'folders'])) {
    throw invalid();
  }

  if (!Array.isArray(value.documents)) {
    throw invalid();
  }

  const documents = (value.documents as unknown[]).map((entry) => {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ['id', 'path', 'type']) ||
      typeof entry.id !== 'string' ||
      !DOCUMENT_ID.test(entry.id) ||
      typeof entry.path !== 'string' ||
      !validateDocumentPath(entry.path).ok ||
      typeof entry.type !== 'string' ||
      !CATALOGUE_ID.test(entry.type)
    ) {
      throw invalid();
    }

    return { id: entry.id, path: entry.path, type: entry.type };
  });

  return { documents, folders: validateFolders(value.folders) };
}
