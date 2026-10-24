import {
  fingerprintCreateClientIntent,
  normalizePersistedCreateIntent,
  type CreateClientIntent,
} from '../intent';
import { CreateOperationError } from '../error';
import type { ResolvedProjectHome } from '../../../project/home/home';
import { DOCUMENT_ID_PATTERN } from '@nevo/specflow-contracts/documents';

import { isExplicitSpecificationSlug } from '../../model';
import { CREATE_SCAFFOLD_FILES_MAX, TEXT_CONTENT_MAX_BYTES } from '../../documents/limits';
import {
  CREATE_JOURNAL_VERSION,
  CREATE_STAGES,
  type CreateJournal,
  type CreateStage,
} from './model';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INTENT_FIELDS = new Set([
  'title',
  'goal',
  'slug',
  'target',
  'archetype',
  'catalogueRevision',
  'optionalDocumentIds',
  'addedDocuments',
  'folders',
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const EXISTING_TARGET_FIELDS = new Set(['kind', 'workspaceId', 'workspaceRoot']);
const WORKTREE_TARGET_FIELDS = new Set([
  'kind',
  'workspaceId',
  'workspaceRoot',
  'branch',
  'baseCommit',
  'instanceId',
  'integrationDestination',
]);

export function parseCreateJournal(
  context: ResolvedProjectHome,
  value: unknown,
  operationId: string,
): CreateJournal {
  if (
    !isRecord(value) ||
    !isValidJournalIdentity(context, value, operationId) ||
    !isValidJournalTarget(value.target) ||
    !isValidJournalFiles(value.files, value.slug) ||
    !isValidJournalDocumentIds(value.documentIds) ||
    !isValidJournalCommit(value) ||
    !isValidJournalIntent(context, value)
  ) {
    throw invalidJournal();
  }
  // Each part has been validated without changing the serialized record.
  return value as unknown as CreateJournal;
}

function isValidJournalIdentity(
  context: ResolvedProjectHome,
  value: Record<string, unknown>,
  operationId: string,
): boolean {
  return (
    value.version === CREATE_JOURNAL_VERSION &&
    value.projectId === context.project.projectId &&
    value.operationId === operationId &&
    UUID.test(operationId) &&
    typeof value.inputFingerprint === 'string' &&
    SHA256.test(value.inputFingerprint) &&
    typeof value.specId === 'string' &&
    UUID.test(value.specId) &&
    typeof value.slug === 'string' &&
    typeof value.title === 'string' &&
    typeof value.created === 'string' &&
    typeof value.catalogueRevision === 'string' &&
    value.catalogueRevision.length > 0 &&
    (value.startedAt === undefined ||
      (typeof value.startedAt === 'string' && !Number.isNaN(Date.parse(value.startedAt)))) &&
    (value.goal === undefined || typeof value.goal === 'string') &&
    isCreateStage(value.stage) &&
    (value.reason === undefined || typeof value.reason === 'string')
  );
}

function isCreateStage(value: unknown): value is CreateStage {
  return typeof value === 'string' && CREATE_STAGES.some((stage) => stage === value);
}

function isValidJournalTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind !== 'existing' && value.kind !== 'new-worktree') return false;
  if (
    typeof value.workspaceId !== 'string' ||
    !UUID.test(value.workspaceId) ||
    typeof value.workspaceRoot !== 'string' ||
    (value.instanceId !== undefined &&
      (typeof value.instanceId !== 'string' || !UUID.test(value.instanceId)))
  ) {
    return false;
  }
  const allowed = value.kind === 'existing' ? EXISTING_TARGET_FIELDS : WORKTREE_TARGET_FIELDS;
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (value.kind === 'existing') return true;
  if (
    value.integrationDestination !== undefined &&
    (!isRecord(value.integrationDestination) ||
      typeof value.integrationDestination.workspaceId !== 'string' ||
      !UUID.test(value.integrationDestination.workspaceId) ||
      typeof value.integrationDestination.branch !== 'string' ||
      value.integrationDestination.branch.length === 0 ||
      (value.integrationDestination.instanceId !== undefined &&
        (typeof value.integrationDestination.instanceId !== 'string' ||
          !UUID.test(value.integrationDestination.instanceId))) ||
      Object.keys(value.integrationDestination).some(
        (key) => key !== 'workspaceId' && key !== 'branch' && key !== 'instanceId',
      ))
  ) {
    return false;
  }
  return (
    typeof value.instanceId === 'string' &&
    UUID.test(value.instanceId) &&
    typeof value.branch === 'string' &&
    typeof value.baseCommit === 'string' &&
    /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu.test(value.baseCommit)
  );
}

/** Optional `commit` evidence and its consistency with the stage and the target. */
function isValidJournalCommit(value: Record<string, unknown>): boolean {
  const commit = value.commit;
  const stage = value.stage;
  const needsCommit = stage === 'commit-writing' || stage === 'commit-written';
  if (commit === undefined) return !needsCommit;
  if (
    !isRecord(commit) ||
    commit.required !== true ||
    typeof commit.branch !== 'string' ||
    commit.branch.length === 0 ||
    commit.branch.length > 240 ||
    (commit.parentHead !== undefined && !isObjectId(commit.parentHead)) ||
    (commit.commitSha !== undefined && !isObjectId(commit.commitSha)) ||
    Object.keys(commit).some(
      (key) =>
        key !== 'required' && key !== 'branch' && key !== 'parentHead' && key !== 'commitSha',
    )
  ) {
    return false;
  }
  if (isRecord(value.target) && value.target.kind === 'new-worktree') {
    if (value.target.branch !== commit.branch) return false;
  }
  if (needsCommit && commit.parentHead === undefined) return false;
  const committed =
    stage === 'commit-written' ||
    stage === 'registry-writing' ||
    stage === 'registry-linked' ||
    stage === 'completed';
  return !committed || commit.commitSha !== undefined;
}

function isObjectId(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu.test(value);
}

const DOCUMENT_ID = new RegExp(DOCUMENT_ID_PATTERN, 'u');
const FILE_FIELDS = new Set(['relativePath', 'sha256', 'bytes']);

/**
 * Evidence of the scaffold: the manifest and the overview first and fixed, then the remaining files
 * (templates, added documents), at most the documented count, every path unique and inside the
 * Specification directory. Contents are not here: they are verified against these hashes in the
 * payload store.
 */
function isValidJournalFiles(value: unknown, slug: unknown): boolean {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > CREATE_SCAFFOLD_FILES_MAX ||
    typeof slug !== 'string'
  ) {
    return false;
  }
  if (!isExplicitSpecificationSlug(slug)) return false;
  const base = 'specs/active/' + slug + '/';
  const paths = new Set<string>();
  for (const file of value as unknown[]) {
    if (
      !isRecord(file) ||
      Object.keys(file).some((key) => !FILE_FIELDS.has(key)) ||
      typeof file.relativePath !== 'string' ||
      !file.relativePath.startsWith(base) ||
      !isSafeRelativeSegments(file.relativePath.slice(base.length)) ||
      paths.has(file.relativePath) ||
      typeof file.sha256 !== 'string' ||
      !SHA256.test(file.sha256) ||
      !Number.isInteger(file.bytes) ||
      (file.bytes as number) < 0 ||
      (file.bytes as number) > TEXT_CONTENT_MAX_BYTES
    ) {
      return false;
    }
    paths.add(file.relativePath);
  }
  const [manifest, overview] = value as [Record<string, unknown>, Record<string, unknown>];
  return (
    manifest.relativePath === base + 'specification.yaml' &&
    overview.relativePath === base + 'overview.md'
  );
}

/** No empty, `.` or `..` segment, no backslash, no absolute form, no NUL or control character. */
function isSafeRelativeSegments(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || /^[a-zA-Z]:/u.test(path)) return false;
  for (const character of path) {
    if (character === String.fromCharCode(92) || character.charCodeAt(0) < 32) return false;
  }
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isValidJournalDocumentIds(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= CREATE_SCAFFOLD_FILES_MAX &&
    value.every((id: unknown) => typeof id === 'string' && DOCUMENT_ID.test(id)) &&
    new Set(value).size === value.length
  );
}

/** Strict durable evidence: no hidden current defaults or generated date in intent. */
function isValidJournalIntent(
  context: ResolvedProjectHome,
  value: Record<string, unknown>,
): boolean {
  const intent = value.requestIntent;
  const plan = value.gitPlan;
  if (
    !isRecord(intent) ||
    typeof intent.title !== 'string' ||
    intent.title !== value.title ||
    (intent.goal !== undefined && typeof intent.goal !== 'string') ||
    intent.goal !== value.goal ||
    (intent.slug !== undefined && intent.slug !== value.slug) ||
    !isRecord(intent.target) ||
    Object.keys(intent).some((key) => !INTENT_FIELDS.has(key))
  ) {
    return false;
  }
  const target = intent.target;
  if (target.kind === 'existing') {
    if (
      !isRecord(value.target) ||
      value.target.kind !== 'existing' ||
      target.workspaceId !== value.target.workspaceId ||
      plan !== undefined ||
      Object.keys(target).some((key) => key !== 'kind' && key !== 'workspaceId')
    ) {
      return false;
    }
  } else if (target.kind === 'new-worktree') {
    if (
      !isRecord(value.target) ||
      value.target.kind !== 'new-worktree' ||
      !isClientOverride(target.baseRef) ||
      !isClientOverride(target.branch) ||
      (target.integrationTargetWorkspaceId !== undefined &&
        (typeof target.integrationTargetWorkspaceId !== 'string' ||
          !UUID.test(target.integrationTargetWorkspaceId))) ||
      (value.target.integrationDestination === undefined) !==
        (target.integrationTargetWorkspaceId === undefined) ||
      (target.integrationTargetWorkspaceId !== undefined &&
        (!isRecord(value.target.integrationDestination) ||
          value.target.integrationDestination.workspaceId !==
            target.integrationTargetWorkspaceId)) ||
      Object.keys(target).some(
        (key) =>
          key !== 'kind' &&
          key !== 'baseRef' &&
          key !== 'branch' &&
          key !== 'integrationTargetWorkspaceId',
      ) ||
      !isRecord(plan) ||
      typeof plan.projectRoot !== 'string' ||
      plan.projectRoot !== context.project.homeRoot ||
      plan.gitInstanceId !== context.project.gitInstanceId ||
      Object.keys(plan).some((key) => key !== 'projectRoot' && key !== 'gitInstanceId')
    ) {
      return false;
    }
  } else {
    return false;
  }
  if (typeof value.inputFingerprint !== 'string') return false;
  const persisted = intent as unknown as CreateClientIntent;
  if (!isValidAddedDocumentEvidence(persisted.addedDocuments, value)) return false;
  try {
    const normalized = normalizePersistedCreateIntent(persisted);
    return (
      JSON.stringify(normalized) === JSON.stringify(persisted) &&
      fingerprintCreateClientIntent(normalized) === value.inputFingerprint
    );
  } catch {
    return false;
  }
}

/** Each added document of the intent is also a journal file of the same hash, size and path. */
function isValidAddedDocumentEvidence(added: unknown, value: Record<string, unknown>): boolean {
  if (!Array.isArray(added) || !Array.isArray(value.files)) return false;
  const base = 'specs/active/' + String(value.slug) + '/';
  return (added as unknown[]).every((document) => {
    if (
      !isRecord(document) ||
      typeof document.path !== 'string' ||
      (document.type !== undefined && typeof document.type !== 'string') ||
      typeof document.sha256 !== 'string' ||
      !SHA256.test(document.sha256) ||
      !Number.isInteger(document.bytes)
    ) {
      return false;
    }
    const expected = base + document.path;
    return (value.files as unknown[]).some(
      (file) =>
        isRecord(file) &&
        file.relativePath === expected &&
        file.sha256 === document.sha256 &&
        file.bytes === document.bytes,
    );
  });
}

function isClientOverride(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'omitted') return Object.keys(value).length === 1;
  return (
    value.kind === 'explicit' &&
    typeof value.value === 'string' &&
    value.value.length > 0 &&
    Object.keys(value).length === 2
  );
}

export function invalidJournal(): CreateOperationError {
  return new CreateOperationError(
    'CREATE_JOURNAL_CORRUPT',
    'Create operation journal is corrupt or redirected. Explicit recovery is required.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
