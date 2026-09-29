import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { Icon } from '../../foundations/Icon';
export const EmptyState = forwardRef(function EmptyState({ actions, className, description, icon, title, ...props }, ref) {
    const capture = useDesignMetadata('EmptyState');
    return (_jsxs("div", { ref: ref, className: cn('flex min-h-40 flex-col items-center justify-center gap-2 rounded-composite border border-border-default px-6 py-10 text-center', className), ...props, ...capture, children: [icon ? (_jsx("div", { className: "text-content-muted", ...designSlot('EmptyState', 'icon'), children: _jsx(Icon, { name: icon, size: "md" }) })) : null, _jsx("div", { className: "text-title-sm text-content-primary", ...designSlot('EmptyState', 'title'), children: title }), description ? (_jsx("div", { className: "max-w-md text-body-sm text-content-muted", ...designSlot('EmptyState', 'description'), children: description })) : null, actions ? (_jsx("div", { className: "flex flex-wrap justify-center gap-2", ...designSlot('EmptyState', 'actions'), children: actions })) : null] }));
});
//# sourceMappingURL=EmptyState.js.map