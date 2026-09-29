import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  Popover as AriaPopover,
  type PopoverProps,
} from 'react-aria-components';
import { floatingSurfaceClassName } from '../../../../design-system/floatingRecipes';
import { cn } from '../../../../lib';

export interface PickerPopoverProps extends Omit<PopoverProps, 'children' | 'className'> {
  children: ReactNode;
  className?: string;
}

/**
 * Legacy date/time family popover.
 * Keep only while a repo-wide search still finds a consumer.
 * New adaptive pickers use AdaptivePickerSurface.
 */
export function PickerPopover({ children, className, ...props }: PickerPopoverProps) {
  return (
    <AriaPopover {...props} className={cn(floatingSurfaceClassName, className)}>
      <AriaDialog className="outline-none">{children}</AriaDialog>
    </AriaPopover>
  );
}

