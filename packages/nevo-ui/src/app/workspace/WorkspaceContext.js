import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from 'react';
const WorkspaceContext = createContext(null);
function getActiveElement() {
    if (typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)) {
        return null;
    }
    const element = document.activeElement;
    return {
        element,
        ariaLabel: element.getAttribute('aria-label'),
        layerKey: element.closest('[data-workspace-layer]')?.dataset.workspaceLayer ?? null,
        name: element.getAttribute('name'),
        tagName: element.tagName,
        text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
}
function isInteractiveLayerElement(element) {
    return !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0;
}
function resolveFocusTarget(target) {
    if (target.element.isConnected && isInteractiveLayerElement(target.element)) {
        return target.element;
    }
    const candidates = Array.from(document.querySelectorAll(target.tagName));
    return candidates.find((candidate) => {
        if (!isInteractiveLayerElement(candidate))
            return false;
        if (target.layerKey &&
            candidate.closest('[data-workspace-layer]')?.dataset.workspaceLayer !==
                target.layerKey) {
            return false;
        }
        if (target.ariaLabel && candidate.getAttribute('aria-label') !== target.ariaLabel)
            return false;
        if (target.name && candidate.getAttribute('name') !== target.name)
            return false;
        if (!target.ariaLabel && !target.name) {
            const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            if (text !== target.text)
                return false;
        }
        return true;
    });
}
export function AppWorkspaceProvider({ children }) {
    const [stack, setStackState] = useState([]);
    const [transition, setTransition] = useState({
        action: 'close',
        revision: 0,
    });
    const stackRef = useRef([]);
    const nextInstanceKey = useRef(0);
    const transitionRevision = useRef(0);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            stackRef.current = [];
        };
    }, []);
    const publishStack = useCallback((next) => {
        stackRef.current = next;
        setStackState(next);
    }, []);
    const publishTransition = useCallback((action) => {
        transitionRevision.current += 1;
        setTransition({ action, revision: transitionRevision.current });
    }, []);
    const createEntry = useCallback((surface, options, returnFocusTo = getActiveElement()) => {
        nextInstanceKey.current += 1;
        return {
            surface,
            instanceKey: nextInstanceKey.current,
            beforeClose: options?.beforeClose,
            onClose: options?.onClose,
            returnFocusTo,
        };
    }, []);
    const passesCloseGuard = useCallback(async (current) => current.beforeClose ? current.beforeClose() : true, []);
    const isCurrentTop = useCallback((current) => mountedRef.current && stackRef.current.at(-1)?.instanceKey === current.instanceKey, []);
    const restoreFocus = useCallback((target, expectedDepth) => {
        if (!target || typeof requestAnimationFrame !== 'function')
            return;
        let attempts = 0;
        const focusWhenLayerIsVisible = () => {
            if (!mountedRef.current || stackRef.current.length !== expectedDepth)
                return;
            const element = resolveFocusTarget(target);
            if (element) {
                element.focus();
                if (document.activeElement === element)
                    return;
            }
            attempts += 1;
            if (attempts < 4)
                requestAnimationFrame(focusWhenLayerIsVisible);
        };
        requestAnimationFrame(focusWhenLayerIsVisible);
    }, []);
    const setSecondary = useCallback(async (surface, options) => {
        if (!mountedRef.current)
            return false;
        const returnFocusTo = getActiveElement();
        const current = stackRef.current.at(-1);
        if (current) {
            if (!(await passesCloseGuard(current)) || !isCurrentTop(current))
                return false;
            current.onClose?.();
            if (!isCurrentTop(current))
                return false;
        }
        const next = createEntry(surface, options, returnFocusTo);
        publishStack(current ? [...stackRef.current.slice(0, -1), next] : [next]);
        publishTransition(current ? 'replace' : 'push');
        return true;
    }, [createEntry, isCurrentTop, passesCloseGuard, publishStack, publishTransition]);
    const pushSecondary = useCallback(async (surface, options) => {
        if (!mountedRef.current)
            return false;
        publishStack([...stackRef.current, createEntry(surface, options)]);
        publishTransition('push');
        return true;
    }, [createEntry, publishStack, publishTransition]);
    const popSecondary = useCallback(async () => {
        const current = stackRef.current.at(-1);
        if (!current)
            return mountedRef.current;
        if (!(await passesCloseGuard(current)) || !isCurrentTop(current))
            return false;
        const nextStack = stackRef.current.slice(0, -1);
        publishStack(nextStack);
        publishTransition('pop');
        current.onClose?.();
        restoreFocus(current.returnFocusTo, nextStack.length);
        return true;
    }, [isCurrentTop, passesCloseGuard, publishStack, publishTransition, restoreFocus]);
    const closeSecondary = useCallback(async () => {
        const current = stackRef.current.at(-1);
        if (!current)
            return mountedRef.current;
        if (!(await passesCloseGuard(current)) || !isCurrentTop(current))
            return false;
        const rootFocusTarget = stackRef.current[0]?.returnFocusTo ?? current.returnFocusTo;
        const closing = [...stackRef.current].reverse();
        publishStack([]);
        publishTransition('close');
        closing.forEach((entry) => entry.onClose?.());
        restoreFocus(rootFocusTarget, 0);
        return true;
    }, [isCurrentTop, passesCloseGuard, publishStack, publishTransition, restoreFocus]);
    const publicStack = useMemo(() => stack.map(({ surface, instanceKey }) => ({ surface, instanceKey })), [stack]);
    const publicSecondary = publicStack.at(-1) ?? null;
    const value = useMemo(() => ({
        secondary: publicSecondary,
        secondaryStack: publicStack,
        secondaryDepth: publicStack.length,
        canGoBack: publicStack.length > 1,
        transition,
        setSecondary,
        pushSecondary,
        popSecondary,
        closeSecondary,
    }), [
        closeSecondary,
        popSecondary,
        publicSecondary,
        publicStack,
        pushSecondary,
        setSecondary,
        transition,
    ]);
    return _jsx(WorkspaceContext.Provider, { value: value, children: children });
}
export function useWorkspace() {
    const workspace = useContext(WorkspaceContext);
    if (!workspace)
        throw new Error('useWorkspace must be used within AppWorkspaceProvider');
    return workspace;
}
export function useOptionalWorkspace() {
    return useContext(WorkspaceContext);
}
//# sourceMappingURL=WorkspaceContext.js.map