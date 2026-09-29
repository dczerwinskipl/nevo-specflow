import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
export const separatorDefaults = { orientation: 'horizontal' };
export const separatorVariants = tv({
    base: 'shrink-0 bg-divider',
    variants: {
        orientation: {
            horizontal: 'h-px w-full',
            vertical: 'h-full min-h-4 w-px self-stretch',
        },
    },
    defaultVariants: separatorDefaults,
});
export const Separator = forwardRef(function Separator({ className, orientation = separatorDefaults.orientation, ...props }, ref) {
    const capture = useDesignMetadata('Separator', { orientation });
    return (_jsx("div", { ref: ref, role: "separator", "aria-orientation": orientation, className: cn(separatorVariants({ orientation }), className), ...props, ...capture }));
});
//# sourceMappingURL=Separator.js.map