import type { WorkspaceProblemField } from '../workspace/model/workspaceValidation';

/**
 * A field of a Create form that can hold the reason Create is blocked, in the forms' order: the
 * name and the archetype (what is created), the agent of the demo flow (who starts it), then the
 * fields of the workspace section (where).
 */
export type CreateProblemField =
  'name' | 'archetype' | 'provider' | 'model' | 'effort' | 'mode' | WorkspaceProblemField;

/**
 * The first focusable control inside a choice group (radio tiles or a radio group): the chosen
 * option unless it is disabled, else the first one that can be chosen. Used to lead a blocked Create to a group that has
 * no single control of its own.
 */
export function firstChoiceControl(container: HTMLElement | null): HTMLElement | null {
  if (!container) {
    return null;
  }

  return (
    container.querySelector<HTMLElement>(
      'input[type="radio"]:checked:not(:disabled):not([aria-disabled="true"]), [role="radio"][aria-checked="true"]:not(:disabled):not([aria-disabled="true"])',
    ) ??
    container.querySelector<HTMLElement>(
      'input[type="radio"]:not(:disabled):not([aria-disabled="true"]), [role="radio"]:not(:disabled):not([aria-disabled="true"])',
    )
  );
}

/**
 * Where a blocked Create leads for an effort or work-mode problem: the chosen (or first enabled)
 * mode of a segmented group, or the picker itself. When the model decides it (the group's items or
 * the picker are disabled), nothing there can take focus, so it leads to the model picker instead.
 */
export function modelDecidedTarget(
  mode: HTMLElement | null,
  model: HTMLElement | null,
): HTMLElement | null {
  if (!mode) {
    return model;
  }

  const usable =
    mode.getAttribute('role') === 'radiogroup'
      ? firstChoiceControl(mode)
      : mode.matches(':disabled, [aria-disabled="true"]')
        ? null
        : mode;

  return usable ?? model;
}
