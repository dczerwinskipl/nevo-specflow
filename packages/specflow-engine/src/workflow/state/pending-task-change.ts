import { JOURNAL_BYTES_MAX } from '../limits';
import { JOURNAL_FOLDER_SEGMENTS, parseJournal } from './journal';
import { readRecordFile } from './record-files';

/**
 * Whether the Specification execution store holds a pending change (its local journal, left by a
 * change that did not finish publishing) that writes a file of the Task's folder: its `task.yaml`
 * or one of its documents. The Task's documents (`specs/documents`, D03) refuse to change while it
 * is pending. Reads one local file; takes no lock (the caller holds the project control lock). A
 * journal that cannot be read fails closed with `WORKFLOW_STATE_CORRUPT`.
 */
export async function hasPendingTaskResourceChange(
  stateRoot: string,
  specId: string,
  taskId: string,
): Promise<boolean> {
  const text = await readRecordFile(
    { root: stateRoot, segments: [...JOURNAL_FOLDER_SEGMENTS] },
    `${specId}.json`,
    JOURNAL_BYTES_MAX,
  );
  if (text === undefined) {
    return false;
  }

  return parseJournal(text, specId).writes.some(
    (write) =>
      (write.target === 'task-manifest' || write.target === 'task-document') &&
      write.taskId === taskId,
  );
}
