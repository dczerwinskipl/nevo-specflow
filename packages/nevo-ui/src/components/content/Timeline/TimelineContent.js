import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { cn } from '../../../lib';
import { Typography } from '../../foundations/Typography';
import { useTimelineSize } from './timelineContext';
const contentVariants = tv({
    base: 'min-w-0',
    variants: {
        size: {
            sm: 'pb-2 group-last/timeline-item:pb-0',
            md: 'pb-5 group-last/timeline-item:pb-0',
        },
    },
});
const descriptionVariants = tv({
    base: 'text-content-secondary',
    variants: {
        size: {
            md: 'mt-1',
        },
    },
});
const metaVariants = tv({
    base: 'text-content-muted',
    variants: {
        size: {
            md: 'mt-1.5',
        },
    },
});
const extraContentVariants = tv({
    variants: {
        size: {
            sm: 'mt-1',
            md: 'mt-2.5',
        },
    },
});
function hasRenderableValue(value) {
    if (value === null || value === undefined || typeof value === 'boolean')
        return false;
    if (typeof value === 'string')
        return value.length > 0;
    if (Array.isArray(value))
        return value.some(hasRenderableValue);
    return true;
}
function CompactContent({ children, description, meta, time, title, }) {
    const hasDescription = hasRenderableValue(description);
    const hasMeta = hasRenderableValue(meta);
    const hasTime = hasRenderableValue(time);
    const hasInlineDetail = hasDescription || hasMeta;
    const inlineDetail = hasDescription ? description : meta;
    const hasSecondaryMeta = hasDescription && hasMeta;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: cn('min-w-0', hasTime && 'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2'), children: [_jsxs("div", { className: "flex min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap", children: [_jsx(Typography, { as: "span", variant: "label-sm", className: "min-w-0 truncate text-content-primary", children: title }), hasInlineDetail ? (_jsxs(_Fragment, { children: [_jsx("span", { "aria-hidden": "true", className: "shrink-0 text-body-sm text-content-muted", children: "\u00B7" }), _jsx(Typography, { as: "span", variant: "body-sm", className: "min-w-0 truncate text-content-secondary", children: inlineDetail })] })) : null] }), hasTime ? (_jsx(Typography, { as: "span", variant: "body-sm", className: "shrink-0 whitespace-nowrap text-content-muted tabular-nums", children: time })) : null] }), hasSecondaryMeta ? (_jsx(Typography, { as: "div", variant: "body-sm", className: "mt-0.5 min-w-0 truncate text-content-muted", children: meta })) : null, hasRenderableValue(children) ? (_jsx("div", { className: cn('min-w-0', extraContentVariants({ size: 'sm' })), children: children })) : null] }));
}
export const TimelineContent = forwardRef(function TimelineContent({ children, className, description, meta, time, title, ...props }, ref) {
    const size = useTimelineSize('Timeline.Content');
    if (size === 'sm') {
        return (_jsx("div", { ref: ref, className: cn(contentVariants({ size }), className), ...props, children: _jsx(CompactContent, { title: title, description: description, meta: meta, time: time, children: children }) }));
    }
    const hasTime = hasRenderableValue(time);
    return (_jsxs("div", { ref: ref, className: cn(contentVariants({ size }), className), ...props, children: [_jsxs("div", { className: cn('min-w-0', hasTime && 'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3'), children: [_jsx(Typography, { as: "div", variant: "title-sm", className: "min-w-0 break-words text-content-primary", children: title }), hasTime ? (_jsx(Typography, { as: "span", variant: "body-sm", className: "shrink-0 whitespace-nowrap text-content-muted tabular-nums", children: time })) : null] }), hasRenderableValue(description) ? (_jsx(Typography, { as: "div", variant: "body-md", className: cn('min-w-0 break-words', descriptionVariants({ size })), children: description })) : null, hasRenderableValue(meta) ? (_jsx(Typography, { as: "div", variant: "body-sm", className: cn('min-w-0 break-words', metaVariants({ size })), children: meta })) : null, hasRenderableValue(children) ? (_jsx("div", { className: cn('min-w-0', extraContentVariants({ size })), children: children })) : null] }));
});
//# sourceMappingURL=TimelineContent.js.map