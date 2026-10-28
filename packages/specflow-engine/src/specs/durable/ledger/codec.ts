import {
  LEDGER_BRANCH_MAX_CHARACTERS,
  LEDGER_MAX_BYTES,
  LEDGER_MAX_OPERATION_IDS,
  LEDGER_MAX_PATHS,
  LEDGER_REASONS,
  LEDGER_VERSION,
  LedgerCorruptError,
  ledgerOwnerKey,
  ledgerOwnerOfKey,
  type LedgerEntry,
  type LedgerRecord,
} from './model';
import { isRecord } from '../guards';

const SHA256 = /^[0-9a-f]{64}$/u;
const OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEYS = [
  'version',
  'projectId',
  'workspaceId',
  'workspaceRoot',
  'owner',
  'branch',
  'head',
  'createdAt',
  'updatedAt',
  'entries',
];
const ENTRY_KEYS = ['path', 'postSha256', 'operationIds', 'operationCount', 'recordedAt', 'reason'];
const PATH_MAX = 1024;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const names = Object.keys(value);
  return names.length === keys.length && keys.every((key) => names.includes(key));
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** A checkout-relative path: `/` separators, no empty, `.` or `..` segment, no control character. */
export function isLedgerPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > PATH_MAX) return false;
  if (value.startsWith('/') || value.includes('\\') || /\p{Cc}/u.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isValidEntry(value: unknown): value is LedgerEntry {
  if (!isRecord(value) || !hasExactKeys(value, ENTRY_KEYS)) return false;
  const ids = value.operationIds;
  return (
    isLedgerPath(value.path) &&
    (value.postSha256 === null ||
      (typeof value.postSha256 === 'string' && SHA256.test(value.postSha256))) &&
    Array.isArray(ids) &&
    ids.length >= 1 &&
    ids.length <= LEDGER_MAX_OPERATION_IDS &&
    ids.every((id) => typeof id === 'string' && UUID.test(id)) &&
    typeof value.operationCount === 'number' &&
    Number.isSafeInteger(value.operationCount) &&
    value.operationCount >= ids.length &&
    isInstant(value.recordedAt) &&
    (LEDGER_REASONS as readonly unknown[]).includes(value.reason)
  );
}

/**
 * Strict decode of a current-format record: closed key set, every field typed, one entry per path
 * (compared case-sensitively; the Engine writes the path it planned), at most the documented caps.
 * Throws {@link LedgerCorruptError}. `ownerKey` is the file name stem the record was read from.
 */
export function parseLedgerRecord(
  context: { readonly project: { readonly projectId: string } },
  value: unknown,
  workspaceId: string,
  ownerKey: string,
): LedgerRecord {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, KEYS) ||
    value.version !== LEDGER_VERSION ||
    value.projectId !== context.project.projectId ||
    value.workspaceId !== workspaceId ||
    typeof value.workspaceRoot !== 'string' ||
    value.workspaceRoot.length === 0 ||
    value.workspaceRoot.length > PATH_MAX ||
    !isRecord(value.owner) ||
    !isValidOwner(value.owner, ownerKey) ||
    !(value.branch === null || (typeof value.branch === 'string' && isShortText(value.branch))) ||
    !(value.head === null || (typeof value.head === 'string' && OBJECT_ID.test(value.head))) ||
    !isInstant(value.createdAt) ||
    !isInstant(value.updatedAt) ||
    !Array.isArray(value.entries) ||
    value.entries.length > LEDGER_MAX_PATHS ||
    !value.entries.every(isValidEntry) ||
    new Set(value.entries.map((entry) => entry.path)).size !== value.entries.length
  ) {
    throw new LedgerCorruptError();
  }
  return value as unknown as LedgerRecord;
}

function isShortText(value: string): boolean {
  return value.length > 0 && value.length <= LEDGER_BRANCH_MAX_CHARACTERS;
}

function isValidOwner(owner: Record<string, unknown>, ownerKey: string): boolean {
  const named = ledgerOwnerOfKey(ownerKey);
  if (named === undefined) return false;
  return (
    ledgerOwnerKey(named) === ledgerOwnerKey(owner as unknown as typeof named) &&
    (owner.kind === 'definitions'
      ? hasExactKeys(owner, ['kind'])
      : hasExactKeys(owner, ['kind', 'id']))
  );
}

/** The text a record is stored as; it is validated like a read, so only readable records are written. */
export function encodeLedgerRecord(
  context: { readonly project: { readonly projectId: string } },
  record: LedgerRecord,
): string {
  parseLedgerRecord(context, record, record.workspaceId, ledgerOwnerKey(record.owner));
  const text = JSON.stringify(record, null, 2) + '\n';
  if (Buffer.byteLength(text, 'utf8') > LEDGER_MAX_BYTES) throw new LedgerCorruptError();
  return text;
}
