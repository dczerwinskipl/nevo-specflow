import { sha256Hex } from '../../../../hash';
import { validateDocumentPath } from '../../../document-rules';
import { isExplicitSpecificationSlug } from '../../../model';
import { documentChangeError } from '../errors';
import {
  DOCUMENT_BATCH_MAX_OPERATIONS,
  DOCUMENT_BATCH_MAX_PATHS,
  DOCUMENT_BATCH_RECORD_MAX_BYTES,
  DOCUMENT_PLAN_MAX_BYTES,
} from '../limits';
import type { PlanEvidence } from '../plan/codec';
import type { DocumentChangePlan, FileState } from '../plan/model';
import type { JournalContext } from './codec';
import type { ExecutorIdentity } from './model';
import {
  OBJECT_ID,
  SHA256,
  UUID,
  exactKeys,
  isCount,
  isExecutorIdentity,
  isIsoInstant,
  isReason,
  isRecord,
} from './shared';
import { isDocumentBatchState, type DocumentBatchState } from './stages';

export const DOCUMENT_BATCH_RECORD_VERSION = 1;

/**
 * One commit batch of one Specification in one checkout, recorded when it is claimed
 * (`engine/operations/documents/batches/<batchId>.json`). The batch id is the operation id of its
 * first member by sequence, which is also the `Nevo-Operation` trailer value of its commit. The
 * path list lives in a hash-addressed file in the payload store; the record keeps its evidence.
 */
export interface DocumentBatchRecord {
  readonly version: typeof DOCUMENT_BATCH_RECORD_VERSION;
  readonly projectId: string;
  /** The batch id. */
  readonly operationId: string;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly specId: string;
  readonly slug: string;
  readonly state: DocumentBatchState;
  /** Operation ids in sequence order; the first is the batch id. */
  readonly memberIds: readonly string[];
  readonly paths: PlanEvidence & { readonly pathCount: number };
  /** The branch the members were reserved on. */
  readonly branch: string;
  /** Recorded at claim, before any Git effect. Absent only while `formed`. */
  readonly parentHead?: string;
  /**
   * Written just before the commit port is called. Absent: no commit of this batch can exist, so a
   * parent that history has since rewritten is simply read again. Present: a commit may exist.
   */
  readonly commitStartedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attempts: number;
  readonly reason?: string;
  readonly blockedBy?: string;
  /** The commit, once `committed`. */
  readonly sha?: string;
  /** The process running the attempt, while `committing`. */
  readonly executor?: ExecutorIdentity;
}

const BATCH_KEYS = [
  'version',
  'projectId',
  'operationId',
  'workspaceId',
  'workspaceRoot',
  'specId',
  'slug',
  'state',
  'memberIds',
  'paths',
  'branch',
  'parentHead',
  'commitStartedAt',
  'createdAt',
  'updatedAt',
  'attempts',
  'reason',
  'blockedBy',
  'sha',
  'executor',
];
const BATCH_OPTIONAL = ['parentHead', 'commitStartedAt', 'reason', 'blockedBy', 'sha', 'executor'];
const SPEC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function invalidBatchRecord(): Error {
  return documentChangeError('journal-corrupt', 'The document commit batch record is corrupt.');
}

export function parseDocumentBatchRecord(
  context: JournalContext,
  value: unknown,
  batchId: string,
): DocumentBatchRecord {
  if (
    !isRecord(value) ||
    !exactKeys(value, BATCH_KEYS, BATCH_OPTIONAL) ||
    value.version !== DOCUMENT_BATCH_RECORD_VERSION ||
    value.projectId !== context.project.projectId ||
    value.operationId !== batchId ||
    !UUID.test(batchId) ||
    typeof value.workspaceId !== 'string' ||
    !UUID.test(value.workspaceId) ||
    typeof value.workspaceRoot !== 'string' ||
    value.workspaceRoot.length === 0 ||
    value.workspaceRoot.length > 1024 ||
    typeof value.specId !== 'string' ||
    !SPEC_ID.test(value.specId) ||
    !isExplicitSpecificationSlug(value.slug) ||
    !isDocumentBatchState(value.state) ||
    !isValidMembers(value.memberIds, batchId) ||
    !isValidPaths(value.paths) ||
    typeof value.branch !== 'string' ||
    value.branch.length === 0 ||
    value.branch.length > 240 ||
    !isIsoInstant(value.createdAt) ||
    !isIsoInstant(value.updatedAt) ||
    !isCount(value.attempts, 1000) ||
    (value.reason !== undefined && !isReason(value.reason)) ||
    (value.blockedBy !== undefined && !isReason(value.blockedBy)) ||
    (value.commitStartedAt !== undefined && !isIsoInstant(value.commitStartedAt)) ||
    !isValidStateFields(value, value.state)
  ) {
    throw invalidBatchRecord();
  }

  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > DOCUMENT_BATCH_RECORD_MAX_BYTES) {
    throw invalidBatchRecord();
  }

  return value as unknown as DocumentBatchRecord;
}

export function encodeDocumentBatchRecord(
  context: JournalContext,
  record: DocumentBatchRecord,
): string {
  parseDocumentBatchRecord(context, record, record.operationId);

  return JSON.stringify(record);
}

function isValidMembers(value: unknown, batchId: string): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= DOCUMENT_BATCH_MAX_OPERATIONS &&
    value[0] === batchId &&
    value.every((id: unknown) => typeof id === 'string' && UUID.test(id)) &&
    new Set(value).size === value.length
  );
}

function isValidPaths(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ['sha256', 'bytes', 'pathCount']) &&
    typeof value.sha256 === 'string' &&
    SHA256.test(value.sha256) &&
    isCount(value.bytes, DOCUMENT_PLAN_MAX_BYTES) &&
    isCount(value.pathCount, DOCUMENT_BATCH_MAX_PATHS) &&
    value.pathCount >= 1
  );
}

function isValidStateFields(value: Record<string, unknown>, state: DocumentBatchState): boolean {
  const has = (key: string): boolean => value[key] !== undefined;
  if (state === 'formed') {
    return !has('parentHead') && !has('executor') && !has('sha') && !has('commitStartedAt');
  }

  if (typeof value.parentHead !== 'string' || !OBJECT_ID.test(value.parentHead)) {
    return false;
  }

  if (has('executor') !== (state === 'committing')) {
    return false;
  }

  if (has('executor') && !isExecutorIdentity(value.executor)) {
    return false;
  }

  if (has('sha') !== (state === 'committed')) {
    return false;
  }

  if (has('sha') && (typeof value.sha !== 'string' || !OBJECT_ID.test(value.sha))) {
    return false;
  }

  if ((state === 'failed' || state === 'recovery-required') && !has('reason')) {
    return false;
  }

  return true;
}

/** The expectation of one batch path: the content before the first member and after the last. */
export interface BatchPathExpectation {
  readonly path: string;
  readonly pre: FileState;
  readonly post: FileState;
}

export const DOCUMENT_BATCH_PATHS_VERSION = 1;

/**
 * The paths of a batch, merged from its members' plans in sequence order: each path keeps the `pre`
 * of the first member that plans it and the `post` of the last. The commit is the final state of
 * these paths. The member plans must be of one Specification.
 */
export function mergeBatchPaths(
  plans: readonly DocumentChangePlan[],
): readonly BatchPathExpectation[] {
  const merged = new Map<string, BatchPathExpectation>();
  for (const plan of plans) {
    for (const path of plan.paths) {
      const known = merged.get(path.path);
      merged.set(path.path, {
        path: path.path,
        pre: known ? known.pre : path.pre,
        post: path.post,
      });
    }
  }

  const result = [...merged.values()];
  if (result.length > DOCUMENT_BATCH_MAX_PATHS) {
    throw documentChangeError('limit-exceeded', 'A batch holds too many paths.');
  }

  return result;
}

export interface EncodedBatchPaths extends PlanEvidence {
  readonly text: string;
  readonly pathCount: number;
}

/** Canonical file of a batch's paths, to be stored hash-addressed in the payload store. */
export function encodeBatchPaths(paths: readonly BatchPathExpectation[]): EncodedBatchPaths {
  const text = JSON.stringify(canonical(paths));
  decodeBatchPaths(text);

  return {
    text,
    sha256: sha256Hex(text),
    bytes: Buffer.byteLength(text, 'utf8'),
    pathCount: paths.length,
  };
}

export function decodeBatchPaths(text: string): readonly BatchPathExpectation[] {
  const fail = (): Error =>
    documentChangeError('plan-invalid', 'The batch path list is unreadable.');
  if (Buffer.byteLength(text, 'utf8') > DOCUMENT_PLAN_MAX_BYTES) {
    throw fail();
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw fail();
  }

  if (
    !isRecord(value) ||
    !exactKeys(value, ['version', 'paths']) ||
    value.version !== DOCUMENT_BATCH_PATHS_VERSION ||
    !Array.isArray(value.paths) ||
    value.paths.length < 1 ||
    value.paths.length > DOCUMENT_BATCH_MAX_PATHS
  ) {
    throw fail();
  }

  const seen = new Set<string>();
  const result = (value.paths as unknown[]).map((entry): BatchPathExpectation => {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, ['path', 'pre', 'post']) ||
      typeof entry.path !== 'string' ||
      seen.has(entry.path) ||
      !isBatchPath(entry.path)
    ) {
      throw fail();
    }

    seen.add(entry.path);

    return { path: entry.path, pre: stateOf(entry.pre, fail), post: stateOf(entry.post, fail) };
  });
  if (JSON.stringify(canonical(result)) !== JSON.stringify(value)) {
    throw fail();
  }

  return result;
}

function canonical(paths: readonly BatchPathExpectation[]): unknown {
  const state = (value: FileState): unknown =>
    value === null ? null : { sha256: value.sha256, bytes: value.bytes };

  return {
    version: DOCUMENT_BATCH_PATHS_VERSION,
    paths: paths.map((entry) => ({
      path: entry.path,
      pre: state(entry.pre),
      post: state(entry.post),
    })),
  };
}

/** `specs/active/<slug>/<document path>` or its manifest. */
function isBatchPath(path: string): boolean {
  const match = /^specs\/active\/([^/]+)\/(.+)$/u.exec(path);
  if (!match) {
    return false;
  }

  const [, slug, rest] = match;

  return (
    isExplicitSpecificationSlug(slug) &&
    rest !== undefined &&
    (rest === 'specification.yaml' || validateDocumentPath(rest).ok)
  );
}

function stateOf(value: unknown, fail: () => Error): FileState {
  if (value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    !exactKeys(value, ['sha256', 'bytes']) ||
    typeof value.sha256 !== 'string' ||
    !SHA256.test(value.sha256) ||
    !isCount(value.bytes, Number.MAX_SAFE_INTEGER)
  ) {
    throw fail();
  }

  return { sha256: value.sha256, bytes: value.bytes };
}
