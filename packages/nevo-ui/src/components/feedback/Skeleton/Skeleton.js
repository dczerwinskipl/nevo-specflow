import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { cn } from '../../../lib';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
export const Skeleton = forwardRef(function Skeleton({ className, ...props }, ref) {
    const capture = useDesignMetadata('Skeleton');
    return (_jsx("div", { ref: ref, "aria-hidden": true, className: cn('animate-pulse rounded-control bg-surface-selected', className), ...props, ...capture }));
});
//# sourceMappingURL=Skeleton.js.map