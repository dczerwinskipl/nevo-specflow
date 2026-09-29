import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { surfaceVariants } from '../Surface';
const CardRoot = forwardRef(function CardRoot({ className, ...props }, ref) {
    const capture = useDesignMetadata('Card');
    return (_jsx("div", { ref: ref, className: cn(surfaceVariants({ tone: 'raised' }), 'grid gap-4 rounded-composite border border-border-subtle p-4', className), ...props, ...capture }));
});
export const CardHeader = forwardRef(function CardHeader({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('grid gap-1', className), ...props, ...designSlot('Card', 'header') }));
});
export const CardBody = forwardRef(function CardBody({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('min-w-0', className), ...props, ...designSlot('Card', 'body') }));
});
export const CardFooter = forwardRef(function CardFooter({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('flex flex-wrap items-center justify-end gap-2', className), ...props, ...designSlot('Card', 'footer') }));
});
export const Card = Object.assign(CardRoot, {
    Header: CardHeader,
    Body: CardBody,
    Footer: CardFooter,
});
//# sourceMappingURL=Card.js.map