import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { tv } from 'tailwind-variants/lite';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { useTimelineSize } from './timelineContext';
export const timelineMarkerVariants = tv({
    base: 'relative z-10 flex shrink-0 items-center justify-center transition-transform motion-reduce:transition-none',
    variants: {
        size: {
            sm: 'size-4',
            md: 'size-5',
        },
        tone: {
            neutral: 'text-content-muted',
            info: 'text-content-link',
            success: 'text-status-success',
            attention: 'text-status-attention',
            danger: 'text-status-danger',
        },
        active: {
            true: 'scale-110',
            false: '',
        },
    },
    defaultVariants: {
        tone: 'neutral',
        active: false,
    },
});
const dotVariants = tv({
    base: 'rounded-full bg-current',
    variants: {
        size: {
            sm: 'size-1.5',
            md: 'size-2',
        },
        active: {
            true: '',
            false: '',
        },
    },
    compoundVariants: [
        { size: 'sm', active: true, class: 'size-2' },
        { size: 'md', active: true, class: 'size-2.5' },
    ],
});
const connectorVariants = tv({
    base: 'pointer-events-none absolute bottom-1 left-1/2 w-px -translate-x-1/2 bg-divider group-last/timeline-item:hidden',
    variants: {
        size: {
            sm: 'top-4',
            md: 'top-5',
        },
    },
});
export const TimelineMarker = forwardRef(function TimelineMarker({ active = false, className, icon, iconClassName, tone = 'neutral' }, ref) {
    const size = useTimelineSize('Timeline.Marker');
    return (_jsxs("div", { className: "relative flex h-full min-h-full justify-center", "aria-hidden": "true", children: [_jsx("span", { className: connectorVariants({ size }) }), _jsx("span", { ref: ref, className: cn(timelineMarkerVariants({ size, tone, active }), className), children: icon ? (_jsx(Icon, { name: icon, size: "sm", className: iconClassName })) : (_jsx("span", { className: dotVariants({ size, active }) })) })] }));
});
//# sourceMappingURL=TimelineMarker.js.map