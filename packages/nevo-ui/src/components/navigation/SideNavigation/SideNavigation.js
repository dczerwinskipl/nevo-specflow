import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { sectionLabelContainerClassName } from '../../../design-system/sectionRecipes';
import { cn } from '../../../lib';
import { Typography } from '../../foundations/Typography';
import { NavigationProvider } from '../NavigationCore';
import { findUnsupportedNavigationDepth, unsupportedNavigationDepthWarning } from './diagnostics';
import { SideNavigationItem, } from './SideNavigationItem';
const defaultSideNavigationMessages = {
    collapse: (label) => `Collapse ${label}`,
    expand: (label) => `Expand ${label}`,
};
/** Persisted Figma identity retained to update existing managed instances in place. */
export const sideNavigationFigmaIdentity = 'TraditionalNavigationMenu';
export function SideNavigation({ adapter, className, defaultExpandedKeys, expandedKeys, label, messages: messagesProp, nodes, onExpandedKeysChange, rootIcons, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...props }) {
    const capture = useDesignMetadata(sideNavigationFigmaIdentity);
    const messages = { ...defaultSideNavigationMessages, ...messagesProp };
    const generatedLabelId = useId();
    const resolvedLabelledBy = ariaLabelledBy ??
        (label !== undefined && ariaLabel === undefined ? generatedLabelId : undefined);
    const unsupported = useMemo(() => findUnsupportedNavigationDepth(nodes), [nodes]);
    const warningSignature = unsupported
        .map(({ depth, key, path }) => `${key}:${depth}:${path.join('>')}`)
        .join('|');
    const previousWarning = useRef(null);
    useEffect(() => {
        if (!import.meta.env.DEV ||
            warningSignature === '' ||
            previousWarning.current === warningSignature) {
            return;
        }
        previousWarning.current = warningSignature;
        console.warn(unsupportedNavigationDepthWarning(unsupported));
    }, [unsupported, warningSignature]);
    const providerProps = expandedKeys === undefined
        ? { adapter, defaultExpandedKeys, nodes, onExpandedKeysChange }
        : { adapter, expandedKeys, nodes, onExpandedKeysChange: onExpandedKeysChange };
    return (_jsx(NavigationProvider, { ...providerProps, children: _jsxs("nav", { "aria-label": ariaLabel, "aria-labelledby": resolvedLabelledBy, className: cn('side-navigation min-w-0', className), ...props, ...capture, children: [label !== undefined ? (_jsx(Typography, { as: "div", className: sectionLabelContainerClassName, id: generatedLabelId, ...designSlot(sideNavigationFigmaIdentity, 'label'), variant: "section-label", children: label })) : null, _jsx("ul", { className: "m-0 grid w-full list-none gap-0.5 p-0", ...designSlot(sideNavigationFigmaIdentity, 'items'), children: nodes.map((node) => (_jsx(SideNavigationItem, { depth: 1, nodeKey: node.key, rootIcons: rootIcons, messages: messages }, node.key))) })] }) }));
}
//# sourceMappingURL=SideNavigation.js.map