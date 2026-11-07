import type { WorkspaceProblemField } from '../workspace/model/workspaceValidation';

/**
 * A field of a Create form that can hold the reason Create is blocked, in the forms' order: the
 * name and the archetype (what is created), the agent of the demo flow (who starts it), then the
 * fields of the workspace section (where).
 */
export type CreateProblemField =
  'name' | 'archetype' | 'provider' | 'model' | 'mode' | WorkspaceProblemField;

/**
 * The first focusable control inside a choice group (radio tiles or a radio group): the chosen
 * option, else the first one that can be chosen. Used to lead a blocked Create to a group that has
 * no single control of its own.
 */
export function firstChoiceControl(container: HTMLElement | null): HTMLElement | null {
  if (!container) {
    return null;
  }

  return (
    container.querySelector<HTMLElement>(
      'input[type="radio"]:checked, [role="radio"][aria-checked="true"]',
    ) ??
    container.querySelector<HTMLElement>(
      'input[type="radio"]:not(:disabled):not([aria-disabled="true"]), [role="radio"]:not(:disabled):not([aria-disabled="true"])',
    )
  );
}
