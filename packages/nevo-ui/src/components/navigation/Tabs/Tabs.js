import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, forwardRef, useContext, useId, useMemo, } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';
import { collectEnabledItemValues, findEnabledItems, resolveRovingIndex, resolveRovingTabStop, useControllableSelection, } from '../../behaviors/rovingSelection';
import { Typography } from '../../foundations/Typography';
const TabsContext = createContext(null);
const TabsListTabStopContext = createContext(undefined);
const tabsTriggerVariants = tv({
    base: 'tabs-trigger -mb-px inline-flex h-control-height-default shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-t-control border-2 border-solid border-x-transparent border-t-transparent px-control-padding-default hover:bg-surface-hover hover:text-content-primary focus-visible:border-focus-ring focus-visible:outline-none data-[design-prop-state=focus]:border-focus-ring data-[design-prop-state=focus]:outline-none disabled:cursor-not-allowed disabled:opacity-50',
    variants: {
        selection: {
            default: 'border-b-transparent bg-transparent text-content-muted',
            selected: 'border-b-action-primary text-content-primary',
        },
    },
    defaultVariants: {
        selection: 'default',
    },
});
function useTabsContext(part) {
    const context = useContext(TabsContext);
    if (!context)
        throw new Error(`${part} must be rendered inside Tabs.`);
    return context;
}
function tabPartId(baseId, part, value) {
    return `${baseId}-${part}-${encodeURIComponent(value)}`;
}
const TabsRoot = forwardRef(function TabsRoot({ children, className, defaultValue, onValueChange, value: controlledValue, ...props }, ref) {
    const generatedId = useId();
    const { selectedValue, select } = useControllableSelection({
        controlledValue,
        defaultValue,
        onValueChange,
    });
    const context = useMemo(() => ({
        baseId: `tabs-${generatedId}`,
        selectedValue,
        select,
    }), [generatedId, select, selectedValue]);
    const capture = useDesignMetadata('Tabs');
    return (_jsx(TabsContext.Provider, { value: context, children: _jsx("div", { ref: ref, className: cn('tabs-root grid min-w-0 gap-4', className), ...props, ...capture, children: children }) }));
});
export const TabsList = forwardRef(function TabsList({ children, className, ...props }, ref) {
    const tabs = useTabsContext('Tabs.List');
    const enabledValues = collectEnabledItemValues(children);
    const tabStopValue = resolveRovingTabStop(tabs.selectedValue, enabledValues);
    return (_jsx(TabsListTabStopContext.Provider, { value: tabStopValue, children: _jsx("div", { ...props, ref: ref, "aria-orientation": "horizontal", className: cn('tabs-list inline-flex w-full max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border-default', className), role: "tablist", ...designSlot('Tabs', 'list'), children: children }) }));
});
export const TabsTrigger = forwardRef(function TabsTrigger({ autoFocus, children, className, disabled = false, onClick, onKeyDown, type = 'button', value, ...props }, ref) {
    const tabs = useTabsContext('Tabs.Trigger');
    const listTabStopValue = useContext(TabsListTabStopContext);
    const selected = tabs.selectedValue === value;
    const tabbable = !disabled && (listTabStopValue === undefined ? selected : listTabStopValue === value);
    const selection = selected ? 'selected' : 'default';
    const capture = useDesignMetadata('TabsTrigger', {
        selection,
        state: disabled ? 'disabled' : autoFocus ? 'focus' : 'default',
    }, { key: value });
    const handleClick = (event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled)
            tabs.select(value);
    };
    const handleKeyDown = (event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented)
            return;
        const enabledTabs = findEnabledItems(event.currentTarget, '[role="tablist"]', '[role="tab"]');
        const currentIndex = enabledTabs.indexOf(event.currentTarget);
        const nextIndex = resolveRovingIndex(event.key, currentIndex, enabledTabs.length);
        if (nextIndex === null)
            return;
        const nextTab = enabledTabs[nextIndex];
        if (!nextTab)
            return;
        const nextValue = nextTab.dataset.tabsValue;
        if (!nextValue)
            return;
        event.preventDefault();
        nextTab.focus();
        tabs.select(nextValue);
    };
    return (_jsx("button", { ...props, ref: ref, "aria-controls": tabPartId(tabs.baseId, 'panel', value), "aria-selected": selected, autoFocus: autoFocus, className: cn(tabsTriggerVariants({ selection }), fastColorTransitionClassName, className), "data-state": selected ? 'active' : 'inactive', "data-tabs-value": value, disabled: disabled, id: tabPartId(tabs.baseId, 'tab', value), onClick: handleClick, onKeyDown: handleKeyDown, role: "tab", tabIndex: tabbable ? 0 : -1, type: type, ...capture, children: _jsx(Typography, { ...designSlot('TabsTrigger', 'label'), variant: "label-sm", children: children }) }));
});
export const TabsContent = forwardRef(function TabsContent({ className, tabIndex, value, ...props }, ref) {
    const tabs = useTabsContext('Tabs.Content');
    const selected = tabs.selectedValue === value;
    return (_jsx("div", { ...props, ref: ref, "aria-labelledby": tabPartId(tabs.baseId, 'tab', value), className: cn('tabs-content min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring', className), "data-state": selected ? 'active' : 'inactive', hidden: !selected, id: tabPartId(tabs.baseId, 'panel', value), role: "tabpanel", tabIndex: tabIndex ?? 0, ...(selected ? designSlot('Tabs', 'content') : {}) }));
});
export const Tabs = Object.assign(TabsRoot, {
    List: TabsList,
    Trigger: TabsTrigger,
    Content: TabsContent,
});
//# sourceMappingURL=Tabs.js.map