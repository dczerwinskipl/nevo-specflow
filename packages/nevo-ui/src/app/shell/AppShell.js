import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { AppBackground, WorkspaceSurface } from '../../components/foundations/Environment';
import { Drawer, DrawerContent, DrawerTitle } from '../../components/overlays/Drawer';
import { cn } from '../../lib';
import { AppFloatingOutlet, AppFloatingProvider } from '../floating/AppFloating';
import { APP_NAVIGATION_WIDTH, APP_SHELL_GAP, WIDE_SHELL_MIN_WIDTH, } from '../workspace/workspaceSizing';
const AppWorkspaceContext = createContext({
    navigationMode: 'drawer',
});
export function useAppWorkspace() {
    return useContext(AppWorkspaceContext);
}
const AppNavigationContext = createContext({
    closeNavigation: () => undefined,
});
export function useAppNavigation() {
    return useContext(AppNavigationContext);
}
function useElementWidth() {
    const ref = useRef(null);
    const [width, setWidth] = useState();
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        const update = () => setWidth(element.getBoundingClientRect().width);
        const observer = new ResizeObserver(update);
        observer.observe(element);
        update();
        return () => observer.disconnect();
    }, []);
    return { ref, width };
}
function useDescendantWidth(rootRef, selector, enabled) {
    const [width, setWidth] = useState();
    useLayoutEffect(() => {
        if (!enabled) {
            setWidth(undefined);
            return;
        }
        const element = rootRef.current?.querySelector(selector);
        if (!element)
            return;
        const update = () => setWidth(element.getBoundingClientRect().width);
        const observer = new ResizeObserver(update);
        observer.observe(element);
        update();
        return () => observer.disconnect();
    }, [enabled, rootRef, selector]);
    return width;
}
const defaultAppShellLabels = {
    closeNavigation: 'Close navigation',
    navigationTitle: 'Application navigation',
};
export function resolveAppShellLayout(width) {
    const wide = width !== undefined && width >= WIDE_SHELL_MIN_WIDTH;
    return {
        availableWidth: width === undefined
            ? undefined
            : Math.max(0, width - (wide ? APP_NAVIGATION_WIDTH + APP_SHELL_GAP : 0)),
        navigationMode: wide ? 'persistent' : 'drawer',
        workspaceMaterialOwner: wide ? 'shell' : 'panel',
        wide,
    };
}
export function AppShell({ brandPrimary, navigation, children, className, labels: labelsProp, style, ...props }) {
    const [navigationOpen, setNavigationOpen] = useState(false);
    const { ref: shellRef, width: shellWidth } = useElementWidth();
    const { availableWidth, navigationMode, workspaceMaterialOwner, wide } = resolveAppShellLayout(shellWidth);
    const labels = { ...defaultAppShellLabels, ...labelsProp };
    const capture = useDesignMetadata('AppShell', { viewport: 'desktop' });
    const workspaceWidth = useDescendantWidth(shellRef, '[data-app-shell-region="workspace"]', wide);
    const isDesignCapture = 'data-design-capture' in capture && capture['data-design-capture'] === 'true';
    const workspaceIsInset = !isDesignCapture &&
        wide &&
        availableWidth !== undefined &&
        workspaceWidth !== undefined &&
        workspaceWidth < availableWidth - 1;
    const closeNavigation = useCallback(() => setNavigationOpen(false), []);
    const navigationContext = useMemo(() => ({ closeNavigation }), [closeNavigation]);
    const workspaceContext = useMemo(() => ({ availableWidth, navigationMode }), [availableWidth, navigationMode]);
    const geometryStyle = {
        '--app-navigation-width': `${APP_NAVIGATION_WIDTH}px`,
        '--app-shell-gap': wide ? `${APP_SHELL_GAP}px` : '0px',
        height: '100dvh',
        ...style,
    };
    useLayoutEffect(() => {
        if (wide)
            setNavigationOpen(false);
    }, [wide]);
    return (_jsx(AppNavigationContext.Provider, { value: navigationContext, children: _jsx(AppFloatingProvider, { supported: wide, children: _jsxs(AppBackground, { brandPrimary: brandPrimary, designMetadata: false, ref: shellRef, className: cn('relative flex h-screen w-full flex-row items-start justify-center gap-[var(--app-shell-gap)] overflow-hidden', className), style: geometryStyle, ...props, ...capture, children: [_jsxs(Drawer, { open: navigationOpen, onOpenChange: setNavigationOpen, children: [wide ? (_jsx("aside", { className: "flex h-full w-[var(--app-navigation-width)] shrink-0 flex-col pt-2", "data-app-shell-region": "navigation", ...designSlot('AppShell', 'navigation'), children: navigation }, "persistent-navigation")) : null, _jsx(AppWorkspaceContext.Provider, { value: workspaceContext, children: workspaceMaterialOwner === 'shell' ? (_jsx(WorkspaceSurface, { as: "main", className: cn('mt-4 h-[calc(100%-1rem)] w-max min-w-0 max-w-[calc(100%-var(--app-navigation-width)-var(--app-shell-gap))] flex-none overflow-hidden rounded-tl-surface border-t border-l border-workspace-edge', workspaceIsInset && 'rounded-r-surface border-r'), "data-app-shell-region": "workspace", "data-app-shell-workspace-fit": workspaceIsInset ? 'inset' : 'edge', designMetadata: false, ...designSlot('AppShell', 'workspace'), children: children })) : (_jsx("main", { className: "h-full w-full min-w-0 flex-none overflow-hidden", "data-app-shell-region": "workspace", "data-app-shell-workspace-material-owner": "panel", ...designSlot('AppShell', 'workspace'), children: children })) }, "workspace"), !wide ? (_jsxs(DrawerContent, { className: "max-w-[min(20rem,85vw)]", closeLabel: labels.closeNavigation, side: "left", children: [_jsx(DrawerTitle, { className: "sr-only", children: labels.navigationTitle }), navigation] }, "drawer-navigation")) : null] }), _jsx(AppFloatingOutlet, {})] }) }) }));
}
//# sourceMappingURL=AppShell.js.map