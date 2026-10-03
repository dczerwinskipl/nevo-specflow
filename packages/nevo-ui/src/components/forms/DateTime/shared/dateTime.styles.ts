import { fastColorTransitionClassName } from '../../../../design-system/interactionRecipes';

export const dateControlClassName = `flex h-control-height-default w-full min-w-0 items-center gap-1 rounded-control border border-solid border-border-default bg-surface-control px-control-padding-inline text-body-md text-content-primary focus-within:border-focus-ring data-[disabled]:border-border-subtle data-[disabled]:bg-surface-subtle data-[disabled]:text-content-muted data-[disabled]:opacity-60 data-[invalid]:border-border-error ${fastColorTransitionClassName}`;

export const dateInputClassName = 'flex min-w-0 flex-1 items-center whitespace-nowrap';

export const dateSegmentClassName =
  'inline-flex min-h-6 min-w-6 items-center justify-center rounded-control-inline px-1 text-body-md text-content-primary outline-none data-[placeholder]:text-content-placeholder data-[disabled]:text-content-muted data-[focused]:bg-surface-selected';

export const dateLiteralClassName =
  'inline-flex min-h-6 items-center justify-center px-0.5 text-body-md text-content-primary';

export const embeddedActionFocusClassName =
  'focus-visible:bg-surface-selected focus-visible:text-content-primary focus-visible:outline-none';
