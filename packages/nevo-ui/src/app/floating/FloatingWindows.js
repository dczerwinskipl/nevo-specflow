import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, forwardRef, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, } from 'react';
import { tv } from 'tailwind-variants/lite';
import { IconButton } from '../../components/actions/IconButton';
import { Icon } from '../../components/foundations/Icon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/overlays/Menu';
import { fastColorTransitionClassName } from '../../design-system/interactionRecipes';
import { cn } from '../../lib';
import { resolveFloatingWindowLayout, } from './floatingWindowLayout';
const FloatingWindowsContext = createContext(null);
function useFloatingWindowsContext(part) {
    const context = useContext(FloatingWindowsContext);
    if (!context) {
        throw new Error(`${part} must be rendered inside FloatingWindowHost.`);
    }
    return context;
}
const defaultFloatingWindowHostLabels = {
    moreWindows: 'More floating windows',
};
export function FloatingWindowHost({ children, className, labels: labelsProp, maxVisible = 3, overflowIcon = 'ellipsis', ...props }) {
    const labels = {
        ...defaultFloatingWindowHostLabels,
        ...labelsProp,
    };
    const [registrations, setRegistrations] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const sequenceRef = useRef(0);
    const activityRef = useRef(0);
    const pendingFocusRef = useRef(null);
    const safeMaxVisible = Number.isFinite(maxVisible) ? Math.max(1, Math.floor(maxVisible)) : 3;
    const layout = useMemo(() => resolveFloatingWindowLayout({
        activeId,
        entries: registrations,
        expandedId,
        maxVisible: safeMaxVisible,
    }), [activeId, expandedId, registrations, safeMaxVisible]);
    const register = useCallback((registration) => {
        setRegistrations((current) => {
            const existing = current.find((item) => item.id === registration.id);
            if (existing) {
                if (existing.title === registration.title &&
                    existing.focusHeader === registration.focusHeader &&
                    existing.notification === registration.notification) {
                    return current;
                }
                return current.map((item) => item.id === registration.id ? { ...item, ...registration } : item);
            }
            return [
                ...current,
                {
                    ...registration,
                    sequence: sequenceRef.current++,
                    lastActivatedAt: 0,
                },
            ];
        });
    }, []);
    const unregister = useCallback((id) => {
        setRegistrations((current) => current.filter((item) => item.id !== id));
        setExpandedId((current) => (current === id ? null : current));
        setActiveId((current) => (current === id ? null : current));
    }, []);
    const activate = useCallback((id) => {
        const activity = ++activityRef.current;
        setActiveId(id);
        setRegistrations((current) => current.map((item) => (item.id === id ? { ...item, lastActivatedAt: activity } : item)));
    }, []);
    const expand = useCallback((id) => {
        pendingFocusRef.current = id;
        activate(id);
        setExpandedId(id);
    }, [activate]);
    const minimize = useCallback((id) => {
        pendingFocusRef.current = id;
        setExpandedId((current) => (current === id ? null : current));
    }, []);
    const requestClose = useCallback((id, onClose) => {
        const currentIndex = layout.visibleIds.indexOf(id);
        pendingFocusRef.current =
            layout.visibleIds[currentIndex + 1] ??
                layout.visibleIds[currentIndex - 1] ??
                'first-visible';
        setExpandedId((current) => (current === id ? null : current));
        setActiveId((current) => (current === id ? null : current));
        onClose();
    }, [layout.visibleIds]);
    useLayoutEffect(() => {
        const target = pendingFocusRef.current;
        if (!target)
            return;
        const targetId = target === 'first-visible' ? layout.visibleIds[0] : target;
        if (!targetId) {
            pendingFocusRef.current = null;
            return;
        }
        const registration = registrations.find((item) => item.id === targetId);
        if (!registration)
            return;
        pendingFocusRef.current = null;
        registration.focusHeader();
    }, [layout.visibleIds, registrations]);
    const visibleSet = useMemo(() => new Set(layout.visibleIds), [layout.visibleIds]);
    const value = useMemo(() => ({
        expandedId,
        isVisible: (id) => visibleSet.has(id),
        register,
        unregister,
        expand,
        minimize,
        requestClose,
    }), [expand, expandedId, minimize, register, requestClose, unregister, visibleSet]);
    const overflow = layout.overflowIds
        .map((id) => registrations.find((registration) => registration.id === id))
        .filter((registration) => Boolean(registration));
    const hasHiddenNotification = overflow.some((registration) => registration.notification);
    const overflowCountLabel = overflow.length > 99 ? '99+' : String(overflow.length);
    return (_jsx(FloatingWindowsContext.Provider, { value: value, children: _jsxs("div", { className: cn('pointer-events-auto absolute bottom-0 right-4 flex max-w-[calc(100%-1rem)] items-end', className), ...props, children: [_jsx("div", { className: "flex min-w-0 items-end gap-2", children: children }), overflow.length > 0 ? (_jsx("div", { className: "ml-4 flex h-control-height-default shrink-0 items-center", children: _jsxs(Menu, { children: [_jsx(MenuTrigger, { asChild: true, children: _jsxs("button", { "aria-label": `${labels.moreWindows} (${overflow.length})`, className: cn('inline-flex h-control-height-compact shrink-0 cursor-pointer items-center gap-1.5 rounded-composite bg-surface-raised px-2.5 text-content-primary hover:bg-surface-hover', fastColorTransitionClassName), type: "button", children: [_jsx(Icon, { name: overflowIcon, size: "md" }), hasHiddenNotification ? (_jsx("span", { "aria-hidden": "true", className: "size-status-indicator-sm shrink-0 rounded-full bg-action-primary" })) : null, _jsx("span", { className: "min-w-3 text-center text-label-sm text-content-primary", children: overflowCountLabel })] }) }), _jsx(MenuContent, { align: "end", side: "top", sideOffset: 8, children: overflow.map((registration) => (_jsx(MenuItem, { onSelect: () => expand(registration.id), children: registration.title }, registration.id))) })] }) })) : null] }) }));
}
const floatingWindowVariants = tv({
    base: 'group/window min-w-0 shrink-0 overflow-hidden rounded-b-none rounded-t-composite border border-b-0',
    variants: {
        expanded: {
            true: 'w-floating-window-expanded max-w-[calc(100vw-2rem)] border-border-default bg-surface-raised shadow-2xl',
            false: 'w-floating-window-collapsed border-border-default bg-surface-raised hover:border-border-strong hover:bg-surface-hover',
        },
        notification: {
            true: 'border-action-primary/60',
            false: '',
        },
    },
    compoundVariants: [
        {
            expanded: false,
            notification: true,
            class: 'bg-action-primary/10 hover:bg-action-primary/15',
        },
    ],
    defaultVariants: {
        expanded: false,
        notification: false,
    },
});
const floatingWindowTitleVariants = tv({
    base: `flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 text-left text-label-sm ${fastColorTransitionClassName}`,
    variants: {
        expanded: {
            true: 'text-content-primary',
            false: 'text-content-secondary group-hover/window:text-content-primary',
        },
        notification: {
            true: 'text-content-primary',
            false: '',
        },
    },
    defaultVariants: {
        expanded: false,
        notification: false,
    },
});
const defaultFloatingWindowLabels = {
    close: 'Close floating window',
    minimize: 'Minimize floating window',
};
export const FloatingWindow = forwardRef(function FloatingWindow({ actions, children, className, id, labels: labelsProp, notification = false, onClose, title, ...props }, ref) {
    const labels = {
        ...defaultFloatingWindowLabels,
        ...labelsProp,
    };
    const host = useFloatingWindowsContext('FloatingWindow');
    const headerRef = useRef(null);
    const focusHeader = useCallback(() => headerRef.current?.focus(), []);
    const { register, unregister } = host;
    useLayoutEffect(() => () => {
        unregister(id);
    }, [id, unregister]);
    useLayoutEffect(() => {
        register({ id, title, focusHeader, notification });
    }, [focusHeader, id, notification, register, title]);
    if (!host.isVisible(id))
        return null;
    const expanded = host.expandedId === id;
    const contentId = `${id}-floating-content`;
    return (_jsxs("div", { ref: ref, id: id, className: cn(floatingWindowVariants({
            expanded,
            notification,
        }), className), "data-notification": notification || undefined, "data-state": expanded ? 'expanded' : 'collapsed', ...props, children: [_jsxs("div", { className: cn('flex h-control-height-default items-center', expanded && 'border-b border-divider'), children: [_jsxs("button", { ref: headerRef, "aria-controls": contentId, "aria-expanded": expanded, className: floatingWindowTitleVariants({
                            expanded,
                            notification,
                        }), onClick: () => (expanded ? host.minimize(id) : host.expand(id)), type: "button", children: [notification && !expanded ? (_jsx("span", { "aria-hidden": "true", className: "size-status-indicator-sm shrink-0 rounded-full bg-action-primary" })) : null, _jsx("span", { className: "min-w-0 flex-1 truncate", children: title })] }), expanded ? (_jsxs("div", { className: "flex shrink-0 items-center gap-1 pr-1", children: [actions, _jsx(IconButton, { "aria-label": labels.minimize, icon: "minimize", onClick: () => host.minimize(id), size: "xs", variant: "ghost" }), onClose ? (_jsx(IconButton, { "aria-label": labels.close, icon: "close", onClick: () => host.requestClose(id, onClose), size: "xs", variant: "ghost" })) : null] })) : onClose ? (_jsx("div", { className: "shrink-0 pr-1", children: _jsx(IconButton, { "aria-label": labels.close, icon: "close", onClick: () => host.requestClose(id, onClose), size: "xs", variant: "ghost" }) })) : null] }), expanded ? (_jsx("div", { className: "min-h-0 max-h-[min(70vh,40rem)] overflow-auto bg-surface", id: contentId, children: children })) : null] }));
});
//# sourceMappingURL=FloatingWindows.js.map