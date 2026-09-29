import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ComponentRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { container?: HTMLElement | null }
>(function TooltipContent({ children, className, container, sideOffset = 6, ...props }, ref) {
  const capture = useDesignMetadata('Tooltip');
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-72 rounded-control border border-border-default bg-surface-raised px-2.5 py-1.5 text-body-sm text-content-primary shadow-xl',
          className,
        )}
        {...props}
        {...capture}
      >
        <span {...designSlot('Tooltip', 'content')}>{children}</span>
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});
