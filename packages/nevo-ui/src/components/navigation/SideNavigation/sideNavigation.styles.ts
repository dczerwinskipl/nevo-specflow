import { tv } from 'tailwind-variants/lite';
import { cn } from '../../../lib';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';

export type SideNavigationItemState = 'none' | 'ancestor' | 'active';

const sideNavigationRowVariants = tv({
  base: 'group relative flex w-full min-w-0 items-center rounded-control',
  variants: {
    state: {
      active: 'bg-surface-selected text-content-primary hover:bg-surface-selected',
      ancestor: 'text-content-primary hover:bg-surface-hover',
      none: 'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
    },
  },
  defaultVariants: {
    state: 'none',
  },
});

export function sideNavigationRowClassName(state: SideNavigationItemState) {
  return cn(sideNavigationRowVariants({ state }), fastColorTransitionClassName);
}

export function sideNavigationContentClassName(interactive = false) {
  return cn(
    'flex min-h-control-height-compact min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-2 py-1.5 text-left text-inherit outline-none',
    interactive && 'cursor-pointer',
  );
}

