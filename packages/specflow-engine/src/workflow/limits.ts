/**
 * Size limits of the stored execution state, single source for the codec and the operations' input
 * checks. The operations reject agent input over a field limit before anything is planned. The byte
 * budget `RECORD_BYTES_MAX` is enforced when a change is serialized: a
 * change that would produce a file over its budget is refused (`WORKFLOW_INPUT_INVALID`) and nothing
 * is stored. A stored file over its budget fails a read as `WORKFLOW_STATE_CORRUPT`.
 */

/**
 * Task ids are file names (`.execution/tasks/<id>.yaml`); the lookahead excludes Windows device
 * names (same rule as `WINDOWS_DEVICE` in `packages/specflow-contracts/src/specs/slug.ts`).
 */
export const TASK_ID_PATTERN_SOURCE =
  '^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$)[a-z0-9][a-z0-9-]{0,63}$';
export const TASK_ID_PATTERN = new RegExp(TASK_ID_PATTERN_SOURCE, 'u');

export const isValidTaskId = (id: string): boolean => TASK_ID_PATTERN.test(id);

export const TASK_TITLE_MAX = 200;
export const TASK_SUMMARY_MAX = 4000;
export const TASK_DEPENDENCIES_MAX = 100;
/** Tasks one finish may create. */
export const TASKS_PER_FINISH_MAX = 100;
/** Tasks of one Specification over all breakdowns. */
export const TASKS_PER_SPECIFICATION_MAX = 200;

export const FEEDBACK_MAX = 16384;
export const ARTIFACTS_MAX = 100;
export const ARTIFACT_MAX = 1000;
/** Plain size bounds of a run's history, checked when a record is written. */
export const ATTEMPTS_MAX = 1000;
export const RETURNS_MAX = 1000;

/**
 * Byte budget of a stored record. The codec refuses a change that would serialize a record over it,
 * and the store checks the size of a file before it reads it, so a hand-made or foreign file cannot
 * make a read load an unbounded amount of data.
 */
export const RECORD_BYTES_MAX = 256 * 1024;
/** A change journal holds at most every record once, JSON-escaped. */
export const JOURNAL_BYTES_MAX = 2 * (TASKS_PER_SPECIFICATION_MAX + 1) * RECORD_BYTES_MAX;
