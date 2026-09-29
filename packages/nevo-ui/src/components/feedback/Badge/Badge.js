import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
export const badgeVariants = tv({
    base: 'inline-flex min-h-5 w-fit items-center rounded-full border px-2 py-0.5 font-sans text-label-sm',
    variants: {
        tone: {
            neutral: 'border-border-default bg-surface-subtle text-content-secondary',
            info: 'border-status-info/30 bg-status-info/10 text-status-info',
            success: 'border-status-success/30 bg-status-success/10 text-status-success',
            attention: 'border-status-attention/30 bg-status-attention/10 text-status-attention',
            danger: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
        },
    },
    defaultVariants: { tone: 'neutral' },
});
export const Badge = forwardRef(function Badge({ children, className, tone, ...props }, ref) {
    const resolvedTone = tone ?? 'neutral';
    const capture = useDesignMetadata('Badge', { tone: resolvedTone });
    return (_jsx("span", { ref: ref, className: cn(badgeVariants({ tone: resolvedTone }), className), ...props, ...capture, children: _jsx("span", { ...designSlot('Badge', 'label'), children: children }) }));
});
//# sourceMappingURL=Badge.js.map