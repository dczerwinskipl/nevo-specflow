import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
export const statusIndicatorVariants = tv({
    base: 'inline-block shrink-0 rounded-full',
    variants: {
        tone: {
            neutral: 'bg-content-muted',
            info: 'bg-status-info',
            success: 'bg-status-success',
            attention: 'bg-status-attention',
            danger: 'bg-status-danger',
        },
        size: {
            sm: 'size-status-indicator-sm',
            md: 'size-status-indicator-md',
        },
    },
    defaultVariants: {
        tone: 'neutral',
        size: 'sm',
    },
});
export const StatusIndicator = forwardRef(function StatusIndicator({ 'aria-label': ariaLabel, className, decorative = true, size = 'sm', tone = 'neutral', ...props }, ref) {
    const capture = useDesignMetadata('StatusIndicator', { tone, size });
    return (_jsx("span", { ref: ref, "aria-hidden": decorative || undefined, "aria-label": decorative ? undefined : ariaLabel, role: decorative ? undefined : 'img', className: cn(statusIndicatorVariants({ tone, size }), className), ...props, ...capture }));
});
//# sourceMappingURL=StatusIndicator.js.map