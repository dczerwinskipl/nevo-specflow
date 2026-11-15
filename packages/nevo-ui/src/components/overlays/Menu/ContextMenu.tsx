import * as RadixContextMenu from '@radix-ui/react-context-menu';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { floatingContentClassName } from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import { Icon, type IconGlyph } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { menuItemDefaults, menuItemVariants } from './Menu';

/**
 * A menu opened on its trigger rather than from a button: right-click with a mouse, long-press on
 * touch (Radix runs its own long-press timer, since iOS Safari fires no `contextmenu` for it).
 * Looks exactly like `Menu`. Pass `disabled` to `ContextMenuTrigger` to keep the browser's own
 * context menu (for example with a mouse, where the same actions are offered on hover).
 */
export const ContextMenu = RadixContextMenu.Root;
export const ContextMenuTrigger = RadixContextMenu.Trigger;

export type ContextMenuContentProps = ComponentPropsWithoutRef<typeof RadixContextMenu.Content> & {
  container?: HTMLElement | null;
};

export const ContextMenuContent = forwardRef<
  ComponentRef<typeof RadixContextMenu.Content>,
  ContextMenuContentProps
>(function ContextMenuContent(
  { children, className, container, collisionPadding = 8, ...props },
  ref,
) {
  const capture = useDesignMetadata('Menu');

  return (
    <RadixContextMenu.Portal container={container}>
      <RadixContextMenu.Content
        ref={ref}
        className={cn(
          'menu-content',
          floatingContentClassName,
          // Same caps as `MenuContent`, on the context menu's own available-space variables.
          'w-56 [&]:min-w-0 max-w-[var(--radix-context-menu-content-available-width)] max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto',
          className,
        )}
        collisionPadding={collisionPadding}
        {...props}
        {...capture}
      >
        <div {...designSlot('Menu', 'items')}>{children}</div>
      </RadixContextMenu.Content>
    </RadixContextMenu.Portal>
  );
});

export interface ContextMenuItemProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixContextMenu.Item>,
  'children'
> {
  children: ReactNode;
  leadingIcon?: IconGlyph;
}

export const ContextMenuItem = forwardRef<
  ComponentRef<typeof RadixContextMenu.Item>,
  ContextMenuItemProps
>(function ContextMenuItem({ children, className, disabled, leadingIcon, ...props }, ref) {
  const capture = useDesignMetadata('MenuItem', {
    state: disabled ? 'disabled' : 'default',
    tone: menuItemDefaults.tone,
  });

  return (
    <RadixContextMenu.Item
      ref={ref}
      className={cn(menuItemVariants({ tone: menuItemDefaults.tone }), className)}
      data-tone={menuItemDefaults.tone}
      disabled={disabled}
      {...props}
      {...capture}
    >
      {leadingIcon ? (
        <span className="inline-flex shrink-0" {...designSlot('MenuItem', 'leadingIcon')}>
          <Icon name={leadingIcon} size="sm" />
        </span>
      ) : null}
      <Typography
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-current"
        {...designSlot('MenuItem', 'label')}
        variant="body-sm"
      >
        {children}
      </Typography>
    </RadixContextMenu.Item>
  );
});
