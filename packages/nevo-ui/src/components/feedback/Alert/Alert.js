import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
export const alertVariants = tv({
    base: 'rounded-composite border px-4 py-3',
    variants: {
        tone: {
            neutral: 'border-border-default bg-surface-subtle',
            info: 'border-status-info/30 bg-status-info/5',
            success: 'border-status-success/30 bg-status-success/5',
            attention: 'border-status-attention/30 bg-status-attention/5',
            danger: 'border-status-danger/30 bg-status-danger/5',
        },
    },
    defaultVariants: { tone: 'neutral' },
});
const toneIcons = {
    neutral: null,
    info: 'info',
    success: 'circle-check',
    attention: 'triangle-alert',
    danger: 'circle-alert',
};
const toneIconClasses = {
    neutral: 'text-content-muted',
    info: 'text-status-info',
    success: 'text-status-success',
    attention: 'text-status-attention',
    danger: 'text-status-danger',
};
export const Alert = forwardRef(function Alert({ actions, children, className, icon, title, tone = 'neutral', role, ...props }, ref) {
    const capture = useDesignMetadata('Alert', { tone });
    const resolvedIcon = icon === undefined ? toneIcons[tone] : icon;
    return (_jsx("div", { ref: ref, className: cn(alertVariants({ tone }), className), role: role, ...props, ...capture, children: _jsxs("div", { className: "flex items-start gap-3", children: [resolvedIcon ? (_jsx("span", { className: cn('mt-0.5 shrink-0', toneIconClasses[tone]), ...designSlot('Alert', 'icon'), children: _jsx(Icon, { name: resolvedIcon, size: "md" }) })) : null, _jsxs("div", { className: "min-w-0 flex-1", children: [title ? (_jsx("div", { className: "text-label-md text-content-primary", ...designSlot('Alert', 'title'), children: title })) : null, children ? (_jsx("div", { className: cn('text-body-sm text-content-secondary', title && 'mt-1'), ...designSlot('Alert', 'body'), children: children })) : null] }), actions ? (_jsx("div", { className: "shrink-0", ...designSlot('Alert', 'actions'), children: actions })) : null] }) }));
});
//# sourceMappingURL=Alert.js.map