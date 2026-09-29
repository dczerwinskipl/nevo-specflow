import { useCallback, useEffect, useRef } from 'react';
function selectedNumber(selection) {
    if (selection === 'all')
        return undefined;
    const first = selection.values().next().value;
    return first === undefined ? undefined : Number(first);
}
export function useWheelColumnScroll({ itemHeight, onSelect, options, selected, settleDelayMs, }) {
    const listRef = useRef(null);
    const settleTimerRef = useRef(null);
    const scrollModeRef = useRef('aligning');
    const skipNextAlignmentRef = useRef(false);
    const alignToSelected = useCallback(() => {
        const element = listRef.current;
        const index = options.indexOf(selected);
        if (!element || index < 0)
            return;
        element.scrollTop = index * itemHeight;
    }, [itemHeight, options, selected]);
    useEffect(() => {
        if (skipNextAlignmentRef.current) {
            skipNextAlignmentRef.current = false;
            return;
        }
        scrollModeRef.current = 'aligning';
        let releaseFrame = 0;
        const alignmentFrame = requestAnimationFrame(() => {
            alignToSelected();
            releaseFrame = requestAnimationFrame(() => {
                scrollModeRef.current = 'idle';
            });
        });
        return () => {
            cancelAnimationFrame(alignmentFrame);
            if (releaseFrame)
                cancelAnimationFrame(releaseFrame);
        };
    }, [alignToSelected]);
    useEffect(() => () => {
        if (settleTimerRef.current !== null)
            window.clearTimeout(settleTimerRef.current);
    }, []);
    const settleNaturalScroll = useCallback((element) => {
        const index = Math.max(0, Math.min(options.length - 1, Math.round(element.scrollTop / itemHeight)));
        const next = options[index];
        if (next !== undefined && next !== selected) {
            skipNextAlignmentRef.current = true;
            onSelect(next);
        }
    }, [itemHeight, onSelect, options, selected]);
    const onScroll = useCallback((event) => {
        if (scrollModeRef.current === 'aligning')
            return;
        if (settleTimerRef.current !== null)
            window.clearTimeout(settleTimerRef.current);
        const element = event.currentTarget;
        settleTimerRef.current = window.setTimeout(() => settleNaturalScroll(element), settleDelayMs);
    }, [settleDelayMs, settleNaturalScroll]);
    const onSelectionChange = useCallback((selection) => {
        const next = selectedNumber(selection);
        if (next !== undefined && next !== selected)
            onSelect(next);
    }, [onSelect, selected]);
    return { listRef, onScroll, onSelectionChange };
}
//# sourceMappingURL=useWheelColumnScroll.js.map