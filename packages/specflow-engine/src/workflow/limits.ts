/**
 * Size limits of the stored execution state, single source for the codec and the operations' input
 * checks. The operations reject agent input over a field limit before anything is planned. The byte
 * budget `RECORD_BYTES_MAX` is enforced when a change is serialized: a
 * change that would produce a file over its budget is refused (`WORKFLOW_INPUT_INVALID`) and nothing
 * is stored. A stored file over its budget fails a read as `WORKFLOW_STATE_CORRUPT`.
 */

import {
  TASK_DEPENDENCIES_MAX,
  TASK_ID_PATTERN as TASK_ID_PATTERN_SOURCE,
  TASK_STATUS_REASON_MAX_LENGTH,
  TASK_SUMMARY_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  TASKS_PER_SPECIFICATION_MAX,
} from '@nevo/specflow-contracts/documents';

/**
 * The Task resource bounds (`tasks/index.yaml`, `tasks/<id>/task.yaml`) are defined once with their
 * published schema in `@nevo/specflow-contracts/documents` (`task-resource-files.ts`) and re-exported
 * here, next to the run limits, under the names the operations use. Task ids are folder and file names
 * (`tasks/<id>/`, `.execution/tasks/<id>.yaml`); the pattern excludes Windows device names.
 */
export {
  TASK_CONTEXT_ENTRIES_MAX,
  TASK_CONTEXT_INSTRUCTIONS_MAX_LENGTH,
  TASK_CONTEXT_NOTE_MAX_LENGTH,
  TASK_DOCUMENTS_MAX,
} from '@nevo/specflow-contracts/documents';
export { TASK_DEPENDENCIES_MAX, TASK_ID_PATTERN_SOURCE, TASKS_PER_SPECIFICATION_MAX };
export const TASK_ID_PATTERN = new RegExp(TASK_ID_PATTERN_SOURCE, 'u');

export const isValidTaskId = (id: string): boolean => TASK_ID_PATTERN.test(id);

export const TASK_TITLE_MAX = TASK_TITLE_MAX_LENGTH;
export const TASK_SUMMARY_MAX = TASK_SUMMARY_MAX_LENGTH;
/** Tasks one finish may create. */
export const TASKS_PER_FINISH_MAX = 100;

/** An escalation's feedback becomes the Task's status reason, so both share one bound. */
export const FEEDBACK_MAX = TASK_STATUS_REASON_MAX_LENGTH;
export const ARTIFACTS_MAX = 100;
export const ARTIFACT_MAX = 1000;
/**
 * Checkout entries a glob `path` context reference may visit to decide whether it matches: the
 * check runs under the project control lock.
 */
export const CONTEXT_PATH_ENTRIES_MAX = 20_000;
/** Plain size bounds of a run's history, checked when a record is written. */
export const ATTEMPTS_MAX = 1000;
export const RETURNS_MAX = 1000;

/**
 * Byte budget of a stored record. The codec refuses a change that would serialize a record over it,
 * and the store checks the size of a file before it reads it, so a hand-made or foreign file cannot
 * make a read load an unbounded amount of data.
 */
export const RECORD_BYTES_MAX = 256 * 1024;
/**
 * A change journal holds at most every target once, JSON-escaped: the Specification run, the Task
 * index, and per Task its run record, its manifest and its initial `task.md`.
 */
export const JOURNAL_BYTES_MAX = 2 * (3 * TASKS_PER_SPECIFICATION_MAX + 2) * RECORD_BYTES_MAX;
