import { DocumentError } from '../../documents/errors';
import {
  CREATE_JOURNAL_GROWTH_HEADROOM_BYTES,
  CREATE_JOURNAL_MAX_BYTES,
} from '../../documents/limits';
import type { CreateJournal } from '../journal';

const size = (value: unknown): number => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

/**
 * The journal stays under the one exported cap, with headroom for the evidence later stages add.
 * File contents are not in it; the goal, the paths and the per-document evidence are. A request that
 * would not fit is refused as an oversize request before anything is written, and the message names
 * the class of input that contributes most (paths, goal or documents).
 */
export function assertJournalFitsItsCap(record: CreateJournal): void {
  const total = Buffer.byteLength(JSON.stringify(record, null, 2), 'utf8') + 1;
  if (total <= CREATE_JOURNAL_MAX_BYTES - CREATE_JOURNAL_GROWTH_HEADROOM_BYTES) return;
  const intent = record.requestIntent;
  const goal = size(record.goal) + size(intent.goal);
  const paths =
    size(intent.addedDocuments.map((document) => document.path)) +
    size(record.files.map((file) => file.relativePath)) +
    size(intent.folders);
  const documents = Math.max(0, total - goal - paths);
  const cause =
    goal >= paths && goal >= documents ? 'goal' : paths >= documents ? 'paths' : 'documents';
  throw new DocumentError(
    'DOCUMENT_OPERATION_INVALID',
    `The Create request is too large to be recorded durably (mostly its ${cause}).`,
  );
}
