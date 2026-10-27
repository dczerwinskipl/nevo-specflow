import { sha256Hex } from '../../../hash';
import type { LedgerEntry } from './model';

/**
 * The `ledgerRevision` of a scope: sha256 of the sorted `path:postSha256` lines (`absent` for a removed
 * file). It is stable for equal content and changes with any entry added, removed or re-imaged.
 */
export function ledgerRevisionOf(
  entries: readonly Pick<LedgerEntry, 'path' | 'postSha256'>[],
): string {
  const lines = entries.map((entry) => entry.path + ':' + (entry.postSha256 ?? 'absent'));
  lines.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return sha256Hex(lines.join('\n'));
}
