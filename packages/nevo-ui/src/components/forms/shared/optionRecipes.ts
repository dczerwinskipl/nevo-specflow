import { cn } from '../../../lib';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';

/** Existing menu text recipes keep their independent single-line / wrapping contracts. */
export const optionLabelClassName =
  'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-current';
export const optionLabelWrappingClassName = 'min-w-0 whitespace-normal break-words text-current';
export const optionDescriptionClassName = 'min-w-0 wrap-anywhere text-content-secondary';

/** Dropdown text uses the full row width; closed controls retain their own truncation recipe. */
export const dropdownOptionLabelClassName =
  'min-w-0 w-full whitespace-normal wrap-anywhere text-current';
export const dropdownOptionDescriptionClassName =
  'min-w-0 w-full whitespace-normal wrap-anywhere text-content-secondary';
export const optionSelectionAccentClassName =
  'pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full bg-action-primary';
export const optionMetaClassName =
  'min-w-0 max-w-full self-start whitespace-normal wrap-anywhere text-content-secondary';

/** Kept separate from menu rows: dropdown selection is a background and a non-layout left accent. */
export function optionItemClassName({
  keepsReasonReadable,
  unavailable,
}: {
  keepsReasonReadable: boolean;
  unavailable: boolean;
}) {
  return cn(
    'relative flex min-h-control-height-compact w-full select-none flex-col items-start gap-0.5 rounded-control px-control-padding-compact py-1.5 text-left text-body-sm text-content-secondary outline-none',
    'data-[design-prop-state=highlighted]:bg-surface-hover data-[design-prop-state=highlighted]:text-content-primary',
    'data-[highlighted]:bg-surface-hover data-[highlighted]:text-content-primary data-[focused]:bg-surface-hover data-[focused]:text-content-primary data-[hovered]:bg-surface-hover data-[hovered]:text-content-primary',
    'data-[highlighted]:outline-solid data-[highlighted]:outline-1 data-[highlighted]:-outline-offset-1 data-[highlighted]:outline-focus-ring data-[focused]:outline-solid data-[focused]:outline-1 data-[focused]:-outline-offset-1 data-[focused]:outline-focus-ring',
    'data-[state=checked]:bg-surface-selected data-[selected]:bg-surface-selected data-[state=checked]:data-[highlighted]:bg-surface-selected data-[selected]:data-[focused]:bg-surface-selected data-[selected]:data-[hovered]:bg-surface-selected data-[state=checked]:data-[design-prop-state=highlighted]:bg-surface-selected',
    'data-[disabled]:pointer-events-none data-[disabled]:text-content-muted',
    !keepsReasonReadable && 'data-[disabled]:opacity-50',
    unavailable && 'cursor-not-allowed text-content-muted',
    fastColorTransitionClassName,
  );
}
