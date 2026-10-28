import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  PAYLOAD_DIRECTORY_SUFFIX,
  payloadDirectory,
  payloadOperationIdOf,
  readPayload,
  removePayload,
  writePayload,
  type PayloadContent,
} from '../../durable';
import { CREATE_JOURNAL_KIND } from './kind';
import type { CreateJournalFile } from './model';

/**
 * Hash-addressed payload store of a Create (see `../../durable/payload-store.ts`): every scaffold
 * file is written ONCE, before the journal is published, to
 * `<operations>/create/<operationId>.payload/<sha256>`. The journal keeps only evidence (path,
 * sha256, bytes); recovery and the scaffold writer read the content from here and verify it, so a
 * catalogue or template change after the crash has no effect.
 */
export { PAYLOAD_DIRECTORY_SUFFIX, payloadOperationIdOf, type PayloadContent };

export function createPayloadDirectory(context: ResolvedProjectHome, operationId: string): string {
  return payloadDirectory(context, CREATE_JOURNAL_KIND, operationId);
}

/**
 * Writes every payload file durably. Caller MUST hold the Project Home control lock, and the
 * journal MUST be published only after this returns.
 */
export async function writeCreatePayload(
  context: ResolvedProjectHome,
  operationId: string,
  files: readonly PayloadContent[],
): Promise<void> {
  return writePayload(context, CREATE_JOURNAL_KIND, operationId, files);
}

/**
 * The verified content of one journal file. A missing, redirected, truncated or modified payload
 * is `CREATE_RECOVERY_REQUIRED`: the scaffold cannot be proven, so nothing is regenerated.
 */
export async function readCreatePayload(
  context: ResolvedProjectHome,
  operationId: string,
  file: CreateJournalFile,
): Promise<string> {
  return readPayload(context, CREATE_JOURNAL_KIND, operationId, file);
}

/** Removes the payload directory of an operation; absent is fine. Best effort for retention. */
export async function removeCreatePayload(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<void> {
  return removePayload(context, CREATE_JOURNAL_KIND, operationId);
}
