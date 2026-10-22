import { fastColorTransitionClassName } from './interactionRecipes';

// Class strings stay literal so Tailwind can detect them.
/**
 * Multi-line choice appearance; consumers own native command or radio semantics.
 * Apply to a button, an aria-checked radio, or a label containing one native radio.
 * aria-disabled only supplies appearance: consumers must also prevent interaction.
 * Display/layout belongs to the composition (usually `choiceSurfaceTracksClassName`),
 * with no nested actions.
 *
 * Disabled is token-only: a quieter surface and border, no hover and no opacity,
 * so the name and the unavailable reason stay readable in their own text roles.
 * Keyboard focus reuses the global focus ring (`focus-ring-within` for the label case).
 */
export const choiceSurfaceClassName = [
  'focus-ring-within relative w-full min-w-0 rounded-composite border border-solid border-border-default bg-surface-control p-4 text-left text-content-primary',
  '[&:not(:disabled):not([aria-disabled=true]):not(:has(input:disabled))]:cursor-pointer',
  '[&:not(:disabled):not([aria-disabled=true]):not(:has(input:disabled)):hover]:bg-surface-hover',
  '[&:is([aria-checked=true],:has(input:checked))]:border-focus-ring',
  '[&:is([aria-checked=true],:has(input:checked))]:bg-surface-selected',
  '[&:is(:disabled,[aria-disabled=true],:has(input:disabled))]:cursor-not-allowed',
  '[&:is(:disabled,[aria-disabled=true],:has(input:disabled))]:border-border-subtle',
  '[&:is(:disabled,[aria-disabled=true],:has(input:disabled))]:bg-surface-subtle',
  fastColorTransitionClassName,
].join(' ');

/**
 * DS-owned content tracks for a choice surface: leading icon / text / trailing check slot.
 * Both icon slots are always reserved so selected and unselected cards keep the same geometry;
 * render the check (`Icon size="sm"`) inside the trailing slot and hide it with `invisible`.
 */
export const choiceSurfaceTracksClassName =
  'grid grid-cols-[var(--spacing-icon-md)_minmax(0,1fr)_var(--spacing-icon-md)] items-start gap-3';

/**
 * Trailing selected-check slot of `choiceSurfaceTracksClassName`: vertically centred on the
 * whole card (not on the first text row). Keep rendering it and toggle `invisible`.
 */
export const choiceSurfaceCheckClassName = 'inline-flex self-center';
