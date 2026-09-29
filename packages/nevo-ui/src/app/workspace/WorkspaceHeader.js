import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { isValidElement } from 'react';
import { Button } from '../../components/actions/Button';
import { IconButton } from '../../components/actions/IconButton';
import { Icon } from '../../components/foundations/Icon';
import { Typography } from '../../components/foundations/Typography';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, } from '../../components/overlays/Menu';
import { cn } from '../../lib';
export function resolveWorkspaceHeaderActions(actions = [], compact = false) {
    if (compact)
        return { overflow: actions };
    const primaryIndex = actions.findIndex((action) => action.primary && action.tone !== 'danger');
    if (primaryIndex < 0)
        return { overflow: actions };
    return {
        directPrimary: actions[primaryIndex],
        overflow: actions.filter((_, index) => index !== primaryIndex),
    };
}
function WorkspaceActionMenu({ actions, className, navigationAction, }) {
    if (actions.length === 0 && !navigationAction)
        return null;
    return (_jsxs(Menu, { children: [_jsx(MenuTrigger, { asChild: true, children: _jsx(IconButton, { "aria-label": "More actions", className: className, icon: "ellipsis", size: "sm", variant: "ghost" }) }), _jsxs(MenuContent, { align: "end", children: [actions.map((action) => (_jsx(MenuItem, { disabled: action.disabled, leadingIcon: action.icon, onSelect: action.onPress, tone: action.tone ?? 'neutral', children: action.label }, action.id))), navigationAction ? (_jsxs(_Fragment, { children: [actions.length > 0 ? _jsx(MenuSeparator, {}) : null, _jsx(MenuItem, { leadingIcon: navigationAction.icon, onSelect: navigationAction.onPress, children: navigationAction.label })] })) : null] })] }));
}
function DirectPrimaryAction({ action }) {
    if (!action.icon) {
        return (_jsx(Button, { disabled: action.disabled, onClick: action.onPress, size: "sm", children: action.label }));
    }
    return (_jsx(Button, { "aria-label": action.label, className: "@max-sm:size-control-height-compact @max-sm:px-0 @max-sm:[&_[data-design-slot=label]]:sr-only", disabled: action.disabled, leadingIcon: action.icon, onClick: action.onPress, size: "sm", children: action.label }));
}
export function WorkspaceHeader({ actions = [], className, icon, status, subtitle, title, }) {
    const resolved = resolveWorkspaceHeaderActions(actions);
    return (_jsxs("div", { className: cn('flex w-full min-w-0 items-center justify-between gap-3', className), "data-workspace-header": "true", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-2.5", children: [icon ? _jsx(Icon, { className: "shrink-0 text-action-primary", name: icon, size: "md" }) : null, _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-2", children: [_jsx(Typography, { as: "h1", className: "min-w-0 truncate outline-none", "data-workspace-header-title": "true", tabIndex: -1, variant: "title-sm", children: title }), status ? _jsx("div", { className: "shrink-0", children: status }) : null] }), subtitle ? (_jsx(Typography, { as: "div", className: "truncate text-content-muted", variant: "body-sm", children: subtitle })) : null] })] }), resolved.directPrimary || resolved.overflow.length > 0 ? (_jsxs("div", { className: "flex shrink-0 items-center gap-1.5", children: [resolved.directPrimary ? _jsx(DirectPrimaryAction, { action: resolved.directPrimary }) : null, _jsx(WorkspaceActionMenu, { actions: resolved.overflow })] })) : null] }));
}
export function isWorkspaceHeaderElement(node) {
    return isValidElement(node) && node.type === WorkspaceHeader;
}
export function getWorkspaceHeaderActions(node) {
    return isWorkspaceHeaderElement(node) ? (node.props.actions ?? []) : [];
}
export function CompactWorkspaceActions({ className, header, navigationAction, }) {
    return (_jsx(WorkspaceActionMenu, { actions: resolveWorkspaceHeaderActions(getWorkspaceHeaderActions(header), true).overflow, className: className, navigationAction: navigationAction }));
}
//# sourceMappingURL=WorkspaceHeader.js.map