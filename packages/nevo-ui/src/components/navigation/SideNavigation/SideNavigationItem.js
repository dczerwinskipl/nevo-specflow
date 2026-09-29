import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from 'react';
import { cn } from '../../../lib';
import { IconButton } from '../../actions/IconButton';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { useNavigationNode } from '../NavigationCore';
import { sideNavigationContentClassName, sideNavigationRowClassName, } from './sideNavigation.styles';
export function SideNavigationItem({ depth, nodeKey, rootIcons, messages, }) {
    const { adapter, isActive, isAncestorOfActive, isExpanded, node, toggleExpanded } = useNavigationNode(nodeKey);
    const generatedId = useId();
    const childListId = `navigation-children-${generatedId}`;
    const hasChildren = Boolean(node.children?.length);
    const canExpand = depth === 1 && hasChildren;
    const state = isActive
        ? 'active'
        : isAncestorOfActive
            ? 'ancestor'
            : 'none';
    const icon = depth === 1 ? rootIcons?.[node.key] : undefined;
    const contentClassName = sideNavigationContentClassName(canExpand && node.target === undefined);
    const label = (_jsx(Typography, { className: [
            'min-w-0 flex-1 whitespace-normal break-words text-inherit [overflow-wrap:anywhere]',
            state === 'active' ? 'font-semibold' : '',
        ].join(' '), variant: "body-md", children: node.label }));
    const leadingContent = (_jsxs(_Fragment, { children: [icon ? (_jsx("span", { className: "flex size-4 shrink-0 items-center justify-center", "data-navigation-root-icon": "true", children: _jsx(Icon, { name: icon, size: "sm" }) })) : null, label] }));
    let content;
    if (canExpand && node.target === undefined) {
        content = (_jsxs("button", { "aria-label": isExpanded ? messages.collapse(node.label) : messages.expand(node.label), "aria-controls": childListId, "aria-expanded": isExpanded, className: contentClassName, "data-navigation-content": "true", onClick: toggleExpanded, type: "button", children: [leadingContent, _jsx(Icon, { name: isExpanded ? 'chevron-down' : 'chevron-right', size: "sm" })] }));
    }
    else if (node.target !== undefined) {
        content = adapter.renderLink({
            node,
            children: leadingContent,
            className: contentClassName,
            isActive,
        });
    }
    else {
        content = (_jsx("div", { className: contentClassName, "data-navigation-content": "true", children: leadingContent }));
    }
    return (_jsxs("li", { className: "w-full min-w-0", children: [_jsxs("div", { className: sideNavigationRowClassName(state), "data-navigation-depth": depth, "data-navigation-state": state, children: [isActive ? (_jsx("span", { "aria-hidden": "true", className: cn('absolute inset-y-0 w-0.5 bg-action-primary', depth === 1 ? 'left-0 rounded-r' : '-left-2 rounded-full'), "data-navigation-active-indicator": "true" })) : null, content, canExpand && node.target !== undefined ? (_jsx(IconButton, { "aria-controls": childListId, "aria-expanded": isExpanded, "aria-label": isExpanded ? messages.collapse(node.label) : messages.expand(node.label), className: "mr-1", "data-navigation-expand-action": "true", icon: isExpanded ? 'chevron-down' : 'chevron-right', onClick: toggleExpanded, size: "xs", variant: "ghost" })) : null] }), canExpand && isExpanded ? (_jsxs("div", { className: "relative mb-0.5 mt-0.5", "data-navigation-expanded-group": "true", children: [_jsx("span", { "aria-hidden": "true", className: "pointer-events-none absolute inset-y-0 left-4 w-px bg-border-strong", "data-navigation-group-guide": "true" }), _jsx("ul", { className: "m-0 grid w-full list-none gap-0.5 py-0 pl-6 pr-0", id: childListId, children: node.children.map((child) => (_jsx(SideNavigationItem, { depth: 2, nodeKey: child.key, rootIcons: rootIcons, messages: messages }, child.key))) })] })) : null] }));
}
//# sourceMappingURL=SideNavigationItem.js.map