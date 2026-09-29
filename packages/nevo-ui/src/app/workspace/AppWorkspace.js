import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Children, Fragment, isValidElement, useCallback, useLayoutEffect, useRef, useState, } from 'react';
import { IconButton } from '../../components/actions/IconButton';
import { ScrollArea } from '../../components/layout/ScrollArea';
import { DrawerTrigger } from '../../components/overlays/Drawer';
import { workspaceSurfaceClassName } from '../../design-system/brandEnvironment';
import { cn } from '../../lib';
import { useAppWorkspace } from '../shell/AppShell';
import { AppContentScrollProvider } from './AppContent';
import { useOptionalWorkspace } from './WorkspaceContext';
import { resolveSlotMaxWidth, resolveWorkspaceSplit, supportsRuntimeWorkspaceSplit, } from './workspaceSizing';
import { useMobileWorkspaceTransition, workspaceSurfaceRuntimeAttributes, } from './useMobileWorkspaceTransition';
import { CompactWorkspaceActions, WorkspaceHeader, } from './WorkspaceHeader';
import './AppWorkspace.css';
const defaultAppWorkspaceLabels = {
    backToPrimary: 'Back to primary content',
    closeSecondary: 'Close secondary content',
    openNavigation: 'Open navigation',
};
function AppWorkspacePrimary(_props) {
    return null;
}
function AppWorkspaceSecondary(_props) {
    return null;
}
function flattenWorkspaceChildren(children) {
    const result = [];
    Children.forEach(children, (child) => {
        if (!isValidElement(child))
            return;
        if (child.type === Fragment) {
            flattenWorkspaceChildren(child.props.children).forEach((nested) => result.push(nested));
            return;
        }
        result.push(child);
    });
    return result;
}
function resolveComposedWorkspace(children) {
    let primary;
    let defaultSecondary;
    for (const child of flattenWorkspaceChildren(children)) {
        if (child.type === AppWorkspacePrimary) {
            if (primary) {
                throw new Error('AppWorkspace accepts only one AppWorkspace.Primary.');
            }
            const props = child.props;
            primary = { header: props.header, content: props.children };
        }
        else if (child.type === AppWorkspaceSecondary) {
            if (defaultSecondary) {
                throw new Error('AppWorkspace accepts only one AppWorkspace.Secondary.');
            }
            const props = child.props;
            defaultSecondary = { header: props.header, content: props.children };
        }
        else {
            throw new Error('AppWorkspace children must be AppWorkspace.Primary or AppWorkspace.Secondary.');
        }
    }
    if (!primary) {
        throw new Error('AppWorkspace requires AppWorkspace.Primary.');
    }
    return { primary, defaultSecondary };
}
function useWorkspaceLayoutState(split, hasSecondary, secondaryCanStack) {
    const { availableWidth, navigationMode } = useAppWorkspace();
    const isSplitView = supportsRuntimeWorkspaceSplit(availableWidth, navigationMode);
    const showSecondary = hasSecondary && (isSplitView || secondaryCanStack);
    const resolvedSplit = resolveWorkspaceSplit(split, isSplitView && showSecondary, availableWidth);
    return {
        mode: isSplitView ? 'split' : 'stacked',
        showSecondary,
        primaryMaxWidth: resolveSlotMaxWidth(availableWidth, resolvedSplit.primary),
        secondaryMaxWidth: resolvedSplit.secondary === 0
            ? undefined
            : resolveSlotMaxWidth(availableWidth, resolvedSplit.secondary),
    };
}
function NavigationAction({ label }) {
    return (_jsx(DrawerTrigger, { asChild: true, children: _jsx(IconButton, { "aria-label": label, icon: "menu", variant: "ghost" }) }));
}
function BackAction({ label, onBack }) {
    return (_jsx(IconButton, { "aria-label": label, className: "[&_svg]:rotate-180", icon: "arrow-right", onClick: () => void onBack(), variant: "ghost" }));
}
function CloseAction({ label, onClose, }) {
    return (_jsx(IconButton, { "aria-label": label, icon: "close", onClick: () => void onClose(), size: "sm", variant: "ghost" }));
}
function RuntimeSurfaceRegion({ compactNavigationAction, divider = false, instanceKey, leadingAction, maxWidth, mobileRuntime, onMobileMotionComplete, stackedVisual, surface, surfaceName, trailingAction, surfaceRef, tabIndex, }) {
    const showHeader = surface.header !== undefined || leadingAction !== undefined || trailingAction !== undefined;
    if (stackedVisual) {
        if (!mobileRuntime?.mounted)
            return null;
        return (_jsx(MobileRuntimeSurfaceRegion, { compactNavigationAction: compactNavigationAction, instanceKey: instanceKey, leadingAction: leadingAction, maxWidth: maxWidth, onMotionComplete: onMobileMotionComplete, runtime: mobileRuntime, surface: surface, surfaceRef: surfaceRef, tabIndex: tabIndex, trailingAction: trailingAction }, mobileRuntime.instanceKey));
    }
    return (_jsx("div", { className: cn('min-w-0 flex-none overflow-hidden outline-none', 'w-max max-w-full', divider && 'border-l border-border-subtle'), "data-workspace-active": "true", "data-workspace-instance": instanceKey, "data-workspace-surface": surfaceName, ref: surfaceRef, tabIndex: tabIndex, style: {
            maxWidth: maxWidth === undefined ? '100%' : `${maxWidth}px`,
        }, children: _jsx("div", { className: "workspace-stack relative h-full min-h-0 min-w-0 overflow-hidden", children: _jsxs("div", { className: "flex h-full min-h-0 flex-col", "data-workspace-layer": instanceKey, children: [showHeader ? (_jsxs("div", { className: cn('@container flex h-14 shrink-0 items-center gap-2', 'border-b border-border-subtle px-4'), children: [leadingAction, _jsx("div", { className: "min-w-0 flex-1", children: surface.header }), trailingAction] })) : null, _jsx("div", { className: "min-h-0 flex-1 overflow-hidden", children: surface.content })] }) }) }));
}
function MobileRuntimeSurfaceRegion({ compactNavigationAction, instanceKey, leadingAction, maxWidth, onMotionComplete, runtime, surface, surfaceRef, tabIndex, trailingAction, }) {
    const rootRef = useRef(null);
    const viewportRef = useRef(null);
    const headerRef = useRef(null);
    const [headerCovered, setHeaderCovered] = useState(false);
    const headerCoveredRef = useRef(false);
    const showHeader = surface.header !== undefined || leadingAction !== undefined || trailingAction !== undefined;
    const updateHeaderCovered = useCallback((scrollTop) => {
        const headerHeight = headerRef.current?.offsetHeight ?? 0;
        const covered = !showHeader || (headerHeight > 0 && scrollTop >= headerHeight - 0.5);
        if (rootRef.current)
            rootRef.current.dataset.headerCovered = String(covered);
        if (headerCoveredRef.current === covered)
            return;
        headerCoveredRef.current = covered;
        setHeaderCovered(covered);
    }, [showHeader]);
    useLayoutEffect(() => {
        const root = rootRef.current;
        const viewport = viewportRef.current;
        if (!root || !viewport)
            return;
        const updateMetrics = () => {
            root.style.setProperty('--mobile-workspace-viewport-height', `${viewport.clientHeight}px`);
            root.style.setProperty('--mobile-workspace-header-height', `${headerRef.current?.offsetHeight ?? 0}px`);
            updateHeaderCovered(viewport.scrollTop);
        };
        const resizeObserver = new ResizeObserver(updateMetrics);
        resizeObserver.observe(viewport);
        if (headerRef.current)
            resizeObserver.observe(headerRef.current);
        updateMetrics();
        return () => resizeObserver.disconnect();
    }, [updateHeaderCovered]);
    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        viewport.scrollTop = 0;
        updateHeaderCovered(0);
    }, [instanceKey, updateHeaderCovered]);
    const setSurfaceRef = useCallback((node) => {
        rootRef.current = node;
        if (typeof surfaceRef === 'function')
            surfaceRef(node);
        else if (surfaceRef)
            surfaceRef.current = node;
    }, [surfaceRef]);
    return (_jsxs("div", { className: cn('@container absolute inset-0 min-w-0 overflow-hidden outline-none', 'h-full w-full', runtime.surface === 'secondary' && 'z-10 bg-canvas bg-app-base', !runtime.visible && 'hidden'), ...workspaceSurfaceRuntimeAttributes(runtime), "aria-hidden": !runtime.visible || undefined, "data-header-covered": headerCovered, inert: !runtime.interactive ? true : undefined, onAnimationEnd: onMotionComplete, ref: setSurfaceRef, tabIndex: tabIndex, style: { maxWidth: maxWidth === undefined ? '100%' : `${maxWidth}px` }, children: [_jsx(ScrollArea, { className: "mobile-workspace-scroll-area h-full", contentClassName: "min-h-full", direction: "vertical", onScroll: (event) => updateHeaderCovered(event.currentTarget.scrollTop), startEdge: headerCovered ? 'auto' : 'hidden', viewportClassName: "mobile-workspace-scroll", viewportRef: viewportRef, children: _jsx("div", { className: "workspace-stack relative min-h-full min-w-0 overflow-hidden", children: _jsxs("div", { className: "workspace-stack__layer workspace-stack__layer--current flex min-h-full flex-col", "data-workspace-layer": instanceKey, children: [showHeader ? (_jsxs("div", { "aria-hidden": headerCovered || undefined, className: "@container flex h-14 shrink-0 items-center gap-2 px-3", inert: headerCovered ? true : undefined, ref: headerRef, children: [leadingAction, _jsx("div", { className: "min-w-0 flex-1", children: surface.header }), trailingAction] })) : null, _jsx("div", { className: "mobile-workspace-sheet flex-1", children: _jsx("div", { className: cn(workspaceSurfaceClassName, 'mobile-workspace-surface min-h-full overflow-hidden rounded-t-surface border border-b-0 border-workspace-edge'), children: _jsx(AppContentScrollProvider, { children: _jsx("div", { className: "min-h-full", children: surface.content }) }) }) })] }) }) }), _jsxs("div", { "aria-hidden": !headerCovered || undefined, className: "mobile-floating-navigation", inert: !headerCovered ? true : undefined, children: [leadingAction, _jsx(CompactWorkspaceActions, { className: "mobile-floating-navigation__control", header: surface.header, navigationAction: compactNavigationAction })] })] }));
}
function AppWorkspaceRoot({ children, labels: labelsProp, split = 'balanced' }) {
    const staticSurfaces = resolveComposedWorkspace(children);
    const workspace = useOptionalWorkspace();
    const { navigationMode } = useAppWorkspace();
    const runtimeSecondary = workspace?.secondary ?? null;
    const secondaryPresentation = runtimeSecondary
        ? {
            surface: runtimeSecondary.surface,
            key: `runtime-${runtimeSecondary.instanceKey}`,
            canStack: true,
            transition: workspace?.transition,
            onClose: workspace?.closeSecondary,
            onBack: workspace?.canGoBack ? workspace.popSecondary : workspace?.closeSecondary,
        }
        : staticSurfaces.defaultSecondary
            ? {
                surface: staticSurfaces.defaultSecondary,
                key: 'default-secondary',
                canStack: false,
                transition: workspace?.transition,
            }
            : undefined;
    const state = useWorkspaceLayoutState(split, secondaryPresentation !== undefined, secondaryPresentation?.canStack ?? false);
    const mobileRuntime = useMobileWorkspaceTransition({
        secondaryInstanceKey: state.mode === 'stacked' && state.showSecondary ? secondaryPresentation?.key : undefined,
        transition: state.mode === 'stacked' && state.showSecondary
            ? secondaryPresentation?.transition
            : undefined,
    });
    const secondaryRegionRef = useRef(null);
    const labels = { ...defaultAppWorkspaceLabels, ...labelsProp };
    const primaryNavigationAction = navigationMode === 'drawer' ? _jsx(NavigationAction, { label: labels.openNavigation }) : undefined;
    const secondaryBackAction = secondaryPresentation?.onBack && (state.mode === 'stacked' || workspace?.canGoBack) ? (_jsx(BackAction, { label: labels.backToPrimary, onBack: secondaryPresentation.onBack })) : undefined;
    const secondaryCloseAction = secondaryPresentation?.onClose ? (_jsx(CloseAction, { label: labels.closeSecondary, onClose: secondaryPresentation.onClose })) : undefined;
    const compactSecondaryCloseAction = secondaryPresentation?.onClose
        ? {
            id: 'close-secondary-navigation',
            label: labels.closeSecondary,
            icon: 'close',
            onPress: () => void secondaryPresentation.onClose?.(),
        }
        : undefined;
    useLayoutEffect(() => {
        if (!secondaryPresentation?.canStack)
            return;
        if (secondaryPresentation.transition?.action !== 'push' &&
            secondaryPresentation.transition?.action !== 'replace') {
            return;
        }
        const frame = requestAnimationFrame(() => {
            const target = secondaryRegionRef.current?.querySelector('.workspace-stack__layer--current [data-workspace-header-title="true"]');
            (target ?? secondaryRegionRef.current)?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [
        secondaryPresentation?.canStack,
        secondaryPresentation?.key,
        secondaryPresentation?.transition?.action,
        secondaryPresentation?.transition?.revision,
    ]);
    return (_jsxs("div", { className: "relative flex h-full max-w-full items-stretch overflow-hidden", "data-layout": state.mode, "data-workspace-fit": state.mode === 'split' && state.showSecondary ? 'content' : 'available', style: {
            width: state.mode === 'split' && state.showSecondary ? 'max-content' : '100%',
        }, children: [_jsx(RuntimeSurfaceRegion, { instanceKey: "primary", leadingAction: primaryNavigationAction, maxWidth: state.primaryMaxWidth, mobileRuntime: state.mode === 'stacked' ? mobileRuntime.primary : undefined, onMobileMotionComplete: mobileRuntime.completeMotion, stackedVisual: state.mode === 'stacked', surface: staticSurfaces.primary, surfaceName: "primary" }), state.showSecondary && secondaryPresentation ? (_jsx(RuntimeSurfaceRegion, { compactNavigationAction: compactSecondaryCloseAction, divider: state.mode === 'split', instanceKey: secondaryPresentation.key, leadingAction: secondaryBackAction, maxWidth: state.mode === 'split' ? state.secondaryMaxWidth : undefined, mobileRuntime: state.mode === 'stacked' ? mobileRuntime.secondary : undefined, onMobileMotionComplete: mobileRuntime.completeMotion, stackedVisual: state.mode === 'stacked', surface: secondaryPresentation.surface, surfaceName: "secondary", surfaceRef: secondaryRegionRef, tabIndex: state.mode === 'stacked' ? -1 : undefined, trailingAction: secondaryCloseAction })) : null] }));
}
export const AppWorkspace = Object.assign(AppWorkspaceRoot, {
    Primary: AppWorkspacePrimary,
    Secondary: AppWorkspaceSecondary,
});
export { WorkspaceHeader, };
export { AppContent, AppContentContainer, AppWorkspaceBody, AppWorkspaceHeader, } from './AppContent';
export { AppWorkspaceSlots, } from './AppWorkspaceSlots';
//# sourceMappingURL=AppWorkspace.js.map