import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { ResolvedProjectHome } from '../../../project/home/home';
import { readFileWindowsSafe, removeFileWindowsSafe } from '../../../project/fs/windows-safe-fs';
import { CREATE_JOURNAL_RELATIVE_DIR, isStrayJournalTempName } from './store';
import { CREATE_JOURNAL_MAX_BYTES } from '../../documents/limits';
import { UUID, parseCreateJournal } from './codec';
import { payloadOperationIdOf, removeCreatePayload } from './payload';
import { classifyCreateJournalText, isExpiredUnsupportedJournal } from './unsupported';

/**
 * How long a settled (`completed`) Create journal is kept before a later reservation may delete it.
 * Inside this window an operationId replays idempotently. After it the same operationId is a NEW
 * operation; slug protection then comes from the Specification existing on disk and in the registry.
 * This is independent of (and much longer than) the 10 minutes a completed row stays in the list.
 */
export const COMPLETED_OPERATION_JOURNAL_RETENTION_DAYS = 7;

/** Upper bound of deletions per reservation so reservation latency stays small. */
export const MAX_JOURNAL_REMOVALS_PER_SWEEP = 50;

/** A stage file older than this is a crash leftover (a live write takes milliseconds under the lock). */
export const STRAY_JOURNAL_TEMP_MAX_AGE_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Removes terminal journals and unsupported (older-format) journals older than the retention. The only terminal, fully settled state in the
 * journal model is `completed`; `recovery-required` and every in-progress stage are evidence and are
 * never removed. Age is the journal file's mtime: each stage transition rewrites the file, so for a
 * completed journal it is the completion time (no schema field is required).
 *
 * The caller MUST hold the Project Home control lock (the same admission as reservation and listing).
 * Uses no Git. Never throws for a single bad file: vanished files are skipped and anything that does
 * not parse as a current journal (corrupt, foreign, symlinked, oversized) is left for the strict
 * listing to surface as recovery-required.
 */
export async function removeExpiredCompletedCreateJournals(
  context: ResolvedProjectHome,
  options: {
    readonly now?: number;
    readonly retentionMs?: number;
    readonly limit?: number;
    readonly keepOperationId?: string;
    readonly tempRetentionMs?: number;
  } = {},
): Promise<number> {
  const now = options.now ?? Date.now();
  const retentionMs = options.retentionMs ?? COMPLETED_OPERATION_JOURNAL_RETENTION_DAYS * DAY_MS;
  const limit = options.limit ?? MAX_JOURNAL_REMOVALS_PER_SWEEP;
  const directory = join(context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
  let names: string[];
  let temps: string[];
  let payloads: string[];
  let anyJournalNames: string[];
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    names = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name);
    temps = entries
      .filter((entry) => entry.isFile() && isStrayJournalTempName(entry.name))
      .map((entry) => entry.name);
    // Any entry named like a journal (even a symlink or directory) protects its payload.
    anyJournalNames = entries.filter((entry) => entry.name.endsWith('.json')).map((e) => e.name);
    payloads = entries
      .filter((entry) => entry.isDirectory() && payloadOperationIdOf(entry.name) !== undefined)
      .map((entry) => entry.name);
  } catch {
    return 0;
  }
  await removeStrayTemps(directory, temps, now, options.tempRetentionMs, limit);
  await removeOrphanedPayloads(context, directory, payloads, anyJournalNames, {
    now,
    retentionMs,
    limit,
    ...(options.keepOperationId !== undefined ? { keepOperationId: options.keepOperationId } : {}),
  });
  let removed = 0;
  for (const name of names) {
    if (removed >= limit) break;
    const operationId = name.slice(0, -5);
    if (!UUID.test(operationId) || operationId === options.keepOperationId) continue;
    const path = join(directory, name);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > CREATE_JOURNAL_MAX_BYTES) continue;
      if (now - stat.mtimeMs < retentionMs) continue;
      const classified = classifyCreateJournalText(await readFileWindowsSafe(path));
      if (classified.kind === 'unsupported') {
        // An older-format (or unparseable) journal is evidence nobody can interpret: it is deleted
        // after the retention, by age only (see unsupported.ts).
        if (!isExpiredUnsupportedJournal(stat.mtimeMs, now, retentionMs)) continue;
        await removeFileWindowsSafe(path);
        await removeCreatePayload(context, operationId).catch(() => undefined);
        removed += 1;
        continue;
      }
      const parsed = parseCreateJournal(context, classified.value, operationId);
      if (parsed.stage !== 'completed') continue;
      await removeFileWindowsSafe(path);
      // The payload goes with its journal. A failure leaves an orphan that the next sweep removes.
      await removeCreatePayload(context, operationId).catch(() => undefined);
      removed += 1;
    } catch {
      // Vanished, unreadable or corrupt: never deleted here, never fatal for the reservation.
    }
  }
  return removed;
}

/**
 * Removes a payload directory that has NO journal and is older than the retention (age by the
 * directory's mtime). A crash between the payload write and the journal publication leaves one. Never
 * while a journal of that operation exists (whatever its state or version), never the directory of
 * `keepOperationId`. Bounded and best effort.
 */
async function removeOrphanedPayloads(
  context: ResolvedProjectHome,
  directory: string,
  payloads: readonly string[],
  journalNames: readonly string[],
  options: {
    readonly now: number;
    readonly retentionMs: number;
    readonly limit: number;
    readonly keepOperationId?: string;
  },
): Promise<void> {
  const journals = new Set(journalNames.map((name) => name.slice(0, -5).toLowerCase()));
  let removed = 0;
  for (const name of payloads) {
    if (removed >= options.limit) return;
    const operationId = payloadOperationIdOf(name);
    if (!operationId || journals.has(operationId.toLowerCase())) continue;
    if (operationId === options.keepOperationId) continue;
    try {
      const stat = await lstat(join(directory, name));
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      if (options.now - stat.mtimeMs < options.retentionMs) continue;
      await removeCreatePayload(context, operationId);
      removed += 1;
    } catch {
      // Vanished or not removable: never fatal for the reservation.
    }
  }
}

/** Crash leftovers of the atomic writer: regular files only, older than the threshold, bounded. */
async function removeStrayTemps(
  directory: string,
  names: readonly string[],
  now: number,
  maxAgeMs: number = STRAY_JOURNAL_TEMP_MAX_AGE_MS,
  limit: number,
): Promise<void> {
  let removed = 0;
  for (const name of names) {
    if (removed >= limit) return;
    const path = join(directory, name);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || now - stat.mtimeMs < maxAgeMs) continue;
      await removeFileWindowsSafe(path);
      removed += 1;
    } catch {
      // Vanished or not removable: never fatal for the reservation.
    }
  }
}
