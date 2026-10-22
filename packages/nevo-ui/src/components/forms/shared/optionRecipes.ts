import { floatingItemVariants } from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';

/**
 * Shared option anatomy for `Select` and `Combobox`: one label line, an optional description line
 * and an optional trailing meta. Both components consume these recipes so their options can never
 * drift apart.
 */
export const optionLabelClassName =
  'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-current';

/**
 * Wrapping variant for pickers whose values must stay distinguishable (branches, workspaces):
 * the label breaks across lines instead of being cut, so the tail of a long value is never lost.
 * `Select` keeps the single-line recipe above.
 */
export const optionLabelWrappingClassName = 'min-w-0 whitespace-normal break-words text-current';

export const optionDescriptionClassName = 'min-w-0 text-content-secondary';

export const optionMetaClassName =
  'inline-flex shrink-0 items-center whitespace-nowrap text-content-secondary';

/** Root class contract for an option; plain options keep the shared floating item recipe untouched. */
export function optionItemClassName({
  keepsReasonReadable,
  unavailable,
}: {
  keepsReasonReadable: boolean;
  unavailable: boolean;
}) {
  return cn(
    'pr-8',
    floatingItemVariants({ fadeDisabled: !keepsReasonReadable }),
    unavailable && 'cursor-not-allowed text-content-muted',
  );
}
