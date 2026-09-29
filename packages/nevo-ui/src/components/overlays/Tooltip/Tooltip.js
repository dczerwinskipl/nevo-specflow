import { jsx as _jsx } from "react/jsx-runtime";
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = forwardRef(function TooltipContent({ children, className, container, sideOffset = 6, ...props }, ref) {
    const capture = useDesignMetadata('Tooltip');
    return (_jsx(TooltipPrimitive.Portal, { container: container, children: _jsx(TooltipPrimitive.Content, { ref: ref, sideOffset: sideOffset, className: cn('z-50 max-w-72 rounded-control border border-border-default bg-surface-raised px-2.5 py-1.5 text-body-sm text-content-primary shadow-xl', className), ...props, ...capture, children: _jsx("span", { ...designSlot('Tooltip', 'content'), children: children }) }) }));
});
//# sourceMappingURL=Tooltip.js.map