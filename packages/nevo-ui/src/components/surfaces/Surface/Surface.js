import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
export const surfaceDefaults = { tone: 'default' };
/**
 * Semantic content surfaces only. Control surfaces stay owned by form controls
 * (`InputGroup`, `TextInput`, Select, etc.) rather than becoming a generic Surface tone.
 */
export const surfaceVariants = tv({
    base: 'text-content-primary',
    variants: {
        tone: {
            default: 'bg-surface',
            raised: 'bg-surface-raised',
            subtle: 'bg-surface-subtle',
        },
    },
    defaultVariants: surfaceDefaults,
});
export const Surface = forwardRef(function Surface({ className, tone = surfaceDefaults.tone, ...props }, ref) {
    const capture = useDesignMetadata('Surface', { tone });
    return (_jsx("div", { ref: ref, className: cn(surfaceVariants({ tone }), className), ...props, ...capture }));
});
//# sourceMappingURL=Surface.js.map