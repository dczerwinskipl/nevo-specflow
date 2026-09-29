import { jsx as _jsx } from "react/jsx-runtime";
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { forwardRef } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { floatingSurfaceClassName } from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import './Popover.css';
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverContent = forwardRef(function PopoverContent({ align = 'start', children, className, container, sideOffset = 8, ...props }, ref) {
    const capture = useDesignMetadata('Popover');
    return (_jsx(PopoverPrimitive.Portal, { container: container, children: _jsx(PopoverPrimitive.Content, { ref: ref, align: align, className: cn('popover-content', floatingSurfaceClassName, className), sideOffset: sideOffset, ...props, ...capture, children: _jsx("div", { ...designSlot('Popover', 'content'), children: children }) }) }));
});
//# sourceMappingURL=Popover.js.map