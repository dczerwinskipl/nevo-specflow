import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { TimelineContent } from './TimelineContent';
import { TimelineItem } from './TimelineItem';
import { TimelineMarker } from './TimelineMarker';
import { timelineDefaults } from './timelineContract';
import { TimelineSizeContext } from './timelineContext';
export { timelineDefaults, timelineSizes } from './timelineContract';
export const timelineRootClassName = 'm-0 flex min-w-0 list-none flex-col p-0';
const TimelineRoot = forwardRef(function TimelineRoot({ children, className, size = timelineDefaults.size, ...props }, ref) {
    const resolvedSize = size ?? timelineDefaults.size;
    const capture = useDesignMetadata('Timeline', { size: resolvedSize });
    return (_jsx(TimelineSizeContext.Provider, { value: resolvedSize, children: _jsx("ol", { ref: ref, className: cn(timelineRootClassName, className), ...props, ...capture, children: children }) }));
});
export const Timeline = Object.assign(TimelineRoot, {
    Item: TimelineItem,
    Marker: TimelineMarker,
    Content: TimelineContent,
});
//# sourceMappingURL=Timeline.js.map