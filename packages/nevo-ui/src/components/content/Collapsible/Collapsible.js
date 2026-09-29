import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Button as AriaButton, Disclosure as AriaDisclosure, DisclosurePanel as AriaDisclosurePanel, } from 'react-aria-components';
import { createContext, forwardRef, useContext, } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
const CollapsibleVisualContext = createContext(null);
function useCollapsibleVisualContext(part) {
    const context = useContext(CollapsibleVisualContext);
    if (!context) {
        throw new Error(`${part} must be rendered inside Collapsible.`);
    }
    return context;
}
const CollapsibleRoot = forwardRef(function CollapsibleRoot({ className, defaultExpanded, isExpanded, showIndicator = true, ...props }, ref) {
    const captureState = (isExpanded ?? defaultExpanded) ? 'expanded' : 'collapsed';
    const capture = useDesignMetadata('Collapsible', {
        state: captureState,
    });
    return (_jsx(CollapsibleVisualContext.Provider, { value: { showIndicator }, children: _jsx(AriaDisclosure, { ref: ref, className: cn('group/collapsible min-w-0', className), defaultExpanded: defaultExpanded, isExpanded: isExpanded, ...props, ...capture }) }));
});
export const CollapsibleTrigger = forwardRef(function CollapsibleTrigger({ children, className, ...props }, ref) {
    const { showIndicator } = useCollapsibleVisualContext('Collapsible.Trigger');
    return (_jsx(AriaButton, { ref: ref, className: cn('flex min-h-control-height-default w-full items-center gap-2 rounded-control px-control-padding-compact text-left text-body-md text-content-secondary hover:bg-surface-hover hover:text-content-primary', fastColorTransitionClassName, className), slot: "trigger", ...props, ...designSlot('Collapsible', 'trigger'), children: (renderProps) => (_jsxs(_Fragment, { children: [showIndicator ? (_jsx(Icon, { className: "text-content-muted transition-transform [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] group-data-[expanded]/collapsible:rotate-90 motion-reduce:transition-none", name: "chevron-right", size: "sm" })) : null, _jsx("span", { className: "min-w-0 flex-1", children: typeof children === 'function' ? children(renderProps) : children })] })) }));
});
export const CollapsibleContent = forwardRef(function CollapsibleContent({ children, className, ...props }, ref) {
    const { showIndicator } = useCollapsibleVisualContext('Collapsible.Content');
    return (_jsx(AriaDisclosurePanel, { ref: ref, className: cn('h-[var(--disclosure-panel-height)] min-w-0 overflow-clip transition-[height] [transition-duration:var(--motion-duration-normal)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none', className), ...props, ...designSlot('Collapsible', 'content'), children: _jsx("div", { className: cn('pb-3 pt-1', showIndicator && 'pl-8'), children: children }) }));
});
export const Collapsible = Object.assign(CollapsibleRoot, {
    Trigger: CollapsibleTrigger,
    Content: CollapsibleContent,
});
//# sourceMappingURL=Collapsible.js.map