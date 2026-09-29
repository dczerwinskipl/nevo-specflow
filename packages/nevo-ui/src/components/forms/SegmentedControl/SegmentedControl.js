import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, forwardRef, useContext, useMemo, } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { collectEnabledItemValues, findEnabledItems, resolveRovingIndex, resolveRovingTabStop, useControllableSelection, } from '../../behaviors/rovingSelection';
import { Typography } from '../../foundations/Typography';
const SegmentedControlContext = createContext(null);
const SegmentedControlTabStopContext = createContext(undefined);
const segmentedControlItemVariants = tv({
    base: 'inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-control px-control-padding-default py-2 text-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50',
    variants: {
        selection: {
            default: 'bg-transparent text-content-secondary hover:bg-surface-hover hover:text-content-primary',
            selected: 'bg-surface-selected text-content-primary shadow-sm',
        },
    },
    defaultVariants: {
        selection: 'default',
    },
});
function useSegmentedControlContext(part) {
    const context = useContext(SegmentedControlContext);
    if (!context) {
        throw new Error(`${part} must be rendered inside SegmentedControl.`);
    }
    return context;
}
const SegmentedControlRoot = forwardRef(function SegmentedControlRoot({ 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, children, className, defaultValue, onValueChange, value: controlledValue, ...props }, ref) {
    const { selectedValue, select } = useControllableSelection({
        controlledValue,
        defaultValue,
        onValueChange,
    });
    const enabledValues = collectEnabledItemValues(children);
    const tabStopValue = resolveRovingTabStop(selectedValue, enabledValues);
    const context = useMemo(() => ({ selectedValue, select }), [selectedValue, select]);
    const capture = useDesignMetadata('SegmentedControl');
    return (_jsx(SegmentedControlContext.Provider, { value: context, children: _jsx(SegmentedControlTabStopContext.Provider, { value: tabStopValue, children: _jsx("div", { ...props, ...capture, ref: ref, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, "aria-orientation": "horizontal", className: cn('inline-flex min-w-0 items-center gap-1 rounded-composite bg-surface-control p-1', className), role: "radiogroup", children: children }) }) }));
});
export const SegmentedControlItem = forwardRef(function SegmentedControlItem({ autoFocus, children, className, disabled = false, onClick, onKeyDown, type = 'button', value, ...props }, ref) {
    const control = useSegmentedControlContext('SegmentedControl.Item');
    const tabStopValue = useContext(SegmentedControlTabStopContext);
    const selected = control.selectedValue === value;
    const tabbable = !disabled && (tabStopValue === undefined ? selected : tabStopValue === value);
    const selection = selected ? 'selected' : 'default';
    const capture = useDesignMetadata('SegmentedControlItem', {
        selection,
        state: disabled ? 'disabled' : autoFocus ? 'focus' : 'default',
    }, { key: value });
    const handleClick = (event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
            control.select(value);
        }
    };
    const handleKeyDown = (event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented)
            return;
        const enabledItems = findEnabledItems(event.currentTarget, '[role="radiogroup"]', '[role="radio"][data-segmented-control-value]');
        const currentIndex = enabledItems.indexOf(event.currentTarget);
        const nextIndex = resolveRovingIndex(event.key, currentIndex, enabledItems.length, true);
        if (nextIndex === null)
            return;
        const nextItem = enabledItems[nextIndex];
        if (!nextItem)
            return;
        const nextValue = nextItem.dataset.segmentedControlValue;
        if (!nextValue)
            return;
        event.preventDefault();
        nextItem.focus();
        control.select(nextValue);
    };
    return (_jsx("button", { ...props, ...capture, ref: ref, "aria-checked": selected, autoFocus: autoFocus, className: cn(segmentedControlItemVariants({ selection }), fastColorTransitionClassName, className), "data-segmented-control-value": value, disabled: disabled, onClick: handleClick, onKeyDown: handleKeyDown, role: "radio", tabIndex: tabbable ? 0 : -1, type: type, children: _jsx(Typography, { ...designSlot('SegmentedControlItem', 'label'), variant: "label-sm", children: children }) }));
});
export const SegmentedControl = Object.assign(SegmentedControlRoot, {
    Item: SegmentedControlItem,
});
//# sourceMappingURL=SegmentedControl.js.map