import { Children, Fragment, isValidElement, useCallback, useState } from 'react';
export function collectEnabledItemValues(children) {
    const values = [];
    Children.forEach(children, (child) => {
        if (!isValidElement(child))
            return;
        const childProps = child.props;
        if (child.type === Fragment) {
            values.push(...collectEnabledItemValues(childProps.children));
            return;
        }
        if (typeof childProps.value === 'string' && !childProps.disabled) {
            values.push(childProps.value);
        }
    });
    return values;
}
export function resolveRovingTabStop(selectedValue, enabledValues) {
    return enabledValues.includes(selectedValue) ? selectedValue : (enabledValues[0] ?? null);
}
export function findEnabledItems(currentItem, containerSelector, itemSelector) {
    const container = currentItem.closest(containerSelector);
    if (!container)
        return [];
    return Array.from(container.querySelectorAll(itemSelector)).filter((candidate) => !candidate.disabled && candidate.closest(containerSelector) === container);
}
export function resolveRovingIndex(key, currentIndex, itemCount, includeVerticalArrows = false) {
    if (itemCount <= 0 || currentIndex < 0)
        return null;
    if (key === 'Home')
        return 0;
    if (key === 'End')
        return itemCount - 1;
    const direction = key === 'ArrowRight' || (includeVerticalArrows && key === 'ArrowDown')
        ? 1
        : key === 'ArrowLeft' || (includeVerticalArrows && key === 'ArrowUp')
            ? -1
            : 0;
    return direction === 0 ? null : (currentIndex + direction + itemCount) % itemCount;
}
export function useControllableSelection({ controlledValue, defaultValue, onValueChange, }) {
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const controlled = controlledValue !== undefined;
    const selectedValue = (controlled ? controlledValue : uncontrolledValue);
    const select = useCallback((nextValue) => {
        if (nextValue === selectedValue)
            return;
        if (!controlled)
            setUncontrolledValue(nextValue);
        onValueChange?.(nextValue);
    }, [controlled, onValueChange, selectedValue]);
    return { selectedValue, select };
}
//# sourceMappingURL=rovingSelection.js.map