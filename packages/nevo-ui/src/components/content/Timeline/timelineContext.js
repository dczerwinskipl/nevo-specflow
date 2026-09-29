import { createContext, useContext } from 'react';
export const TimelineSizeContext = createContext(null);
export function useTimelineSize(part) {
    const size = useContext(TimelineSizeContext);
    if (!size)
        throw new Error(`${part} must be rendered inside Timeline.`);
    return size;
}
//# sourceMappingURL=timelineContext.js.map