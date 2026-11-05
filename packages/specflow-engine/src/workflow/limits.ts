/**
 * Size limits of the stored execution state. The codec checks them on every read and write, and the
 * operations reject agent input that breaks them before anything is planned, so a finish can never
 * persist a record that later fails to read. Single source for both.
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
/** One item per subject: every Task and the Specification. */
export const ATTENTION_ITEMS_MAX = TASKS_PER_SPECIFICATION_MAX + 1;

export const FEEDBACK_MAX = 16384;
export const ARTIFACTS_MAX = 100;
export const ARTIFACT_MAX = 1000;
/** Plain size bounds of a run's history, checked when a record is written. */
export const ATTEMPTS_MAX = 1000;
export const RETURNS_MAX = 1000;
