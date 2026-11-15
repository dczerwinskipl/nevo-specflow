import type { EditTaskInput, OwnerActor } from '@nevo/specflow-engine';

import type { TaskContextEntry } from './context-input';

/** The options of `tasks edit` that say what changes; an absent option leaves the field unchanged. */
export interface EditOptions {
  readonly expectedRevision: string;
  readonly title?: string;
  readonly summary?: string;
  readonly clearSummary?: boolean;
  /** Repeatable; commander gives `[]` when it is absent. */
  readonly dependsOn?: readonly string[];
  /** Commander sets it to `false` for `--no-dependencies`. */
  readonly dependencies?: boolean;
  readonly defaultContext?: boolean;
}

/**
 * The Engine's edit from the options: `--clear-summary` removes the summary (`null`),
 * `--no-dependencies` sets none (`[]`), `--default-context` restores the default context (`null`);
 * context entries replace the whole list; everything not named stays as it is.
 */
export function editTaskInput(input: {
  readonly specId: string;
  readonly taskId: string;
  readonly options: EditOptions;
  /** The entries of `--context`/`--context-file`, or undefined when none was given. */
  readonly context: readonly TaskContextEntry[] | undefined;
  readonly actor: OwnerActor;
}): EditTaskInput {
  const { options, context } = input;
  const dependsOn =
    options.dependencies === false ? [] : options.dependsOn?.length ? options.dependsOn : undefined;

  return {
    specId: input.specId,
    taskId: input.taskId,
    expectedRevision: options.expectedRevision,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.summary !== undefined
      ? { summary: options.summary }
      : options.clearSummary
        ? { summary: null }
        : {}),
    ...(dependsOn !== undefined ? { dependsOn } : {}),
    ...(options.defaultContext ? { context: null } : context !== undefined ? { context } : {}),
    actor: input.actor,
  };
}
