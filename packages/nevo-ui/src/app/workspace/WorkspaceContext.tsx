import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import type { AppWorkspaceSurface } from './workspaceSurface';

export interface WorkspaceSecondaryOptions {
  beforeClose?: () => boolean | Promise<boolean>;
  onClose?: () => void;
}

export interface WorkspaceSecondaryState {
  surface: AppWorkspaceSurface;
  instanceKey: number;
}

export interface WorkspaceTransition {
  action: 'push' | 'pop' | 'replace' | 'close';
  revision: number;
  incoming: WorkspaceSecondaryState | null;
  outgoing: WorkspaceSecondaryState | null;
}

type WorkspaceSecondaryInternalState = WorkspaceSecondaryState & {
  beforeClose?: () => boolean | Promise<boolean>;
  onClose?: () => void;
  returnFocusTo: WorkspaceFocusTarget | null;
};

interface WorkspaceFocusTarget {
  element: HTMLElement;
  ariaLabel: string | null;
  layerKey: string | null;
  name: string | null;
  tagName: string;
  text: string;
}

export interface WorkspaceContextValue {
  secondary: WorkspaceSecondaryState | null;
  secondaryStack: readonly WorkspaceSecondaryState[];
  secondaryDepth: number;
  canGoBack: boolean;
  transition: WorkspaceTransition;
  setSecondary: (
    surface: AppWorkspaceSurface,
    options?: WorkspaceSecondaryOptions,
  ) => Promise<boolean>;
  pushSecondary: (
    surface: AppWorkspaceSurface,
    options?: WorkspaceSecondaryOptions,
  ) => Promise<boolean>;
  popSecondary: () => Promise<boolean>;
  closeSecondary: () => Promise<boolean>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function getActiveElement(): WorkspaceFocusTarget | null {
  if (typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)) {
    return null;
  }

  const element = document.activeElement;
  return {
    element,
    ariaLabel: element.getAttribute('aria-label'),
    layerKey:
      element.closest<HTMLElement>('[data-workspace-layer]')?.dataset.workspaceLayer ?? null,
    name: element.getAttribute('name'),
    tagName: element.tagName,
    text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  };
}

function isInteractiveLayerElement(element: HTMLElement) {
  return !element.closest('[inert], [aria-hidden="true"]') && element.getClientRects().length > 0;
}

function resolveFocusTarget(target: WorkspaceFocusTarget) {
  if (target.element.isConnected && isInteractiveLayerElement(target.element)) {
    return target.element;
  }

  const candidates = Array.from(document.querySelectorAll<HTMLElement>(target.tagName));
  return candidates.find((candidate) => {
    if (!isInteractiveLayerElement(candidate)) return false;
    if (
      target.layerKey &&
      candidate.closest<HTMLElement>('[data-workspace-layer]')?.dataset.workspaceLayer !==
        target.layerKey
    ) {
      return false;
    }
    if (target.ariaLabel && candidate.getAttribute('aria-label') !== target.ariaLabel) return false;
    if (target.name && candidate.getAttribute('name') !== target.name) return false;
    if (!target.ariaLabel && !target.name) {
      const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text !== target.text) return false;
    }
    return true;
  });
}

export function AppWorkspaceProvider({ children }: PropsWithChildren) {
  const [stack, setStackState] = useState<WorkspaceSecondaryInternalState[]>([]);
  const [transition, setTransition] = useState<WorkspaceTransition>({
    action: 'close',
    revision: 0,
    incoming: null,
    outgoing: null,
  });
  const stackRef = useRef<WorkspaceSecondaryInternalState[]>([]);
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

  const publishStack = useCallback((next: WorkspaceSecondaryInternalState[]) => {
    stackRef.current = next;
    setStackState(next);
  }, []);

  const publishTransition = useCallback(
    (
      action: WorkspaceTransition['action'],
      outgoing: WorkspaceSecondaryInternalState | undefined,
      incoming: WorkspaceSecondaryInternalState | undefined,
    ) => {
      transitionRevision.current += 1;
      setTransition({
        action,
        revision: transitionRevision.current,
        outgoing: outgoing
          ? { surface: outgoing.surface, instanceKey: outgoing.instanceKey }
          : null,
        incoming: incoming
          ? { surface: incoming.surface, instanceKey: incoming.instanceKey }
          : null,
      });
    },
    [],
  );

  const createEntry = useCallback(
    (
      surface: AppWorkspaceSurface,
      options?: WorkspaceSecondaryOptions,
      returnFocusTo = getActiveElement(),
    ) => {
      nextInstanceKey.current += 1;
      return {
        surface,
        instanceKey: nextInstanceKey.current,
        beforeClose: options?.beforeClose,
        onClose: options?.onClose,
        returnFocusTo,
      } satisfies WorkspaceSecondaryInternalState;
    },
    [],
  );

  const passesCloseGuard = useCallback(
    async (current: WorkspaceSecondaryInternalState) =>
      current.beforeClose ? current.beforeClose() : true,
    [],
  );

  const isCurrentTop = useCallback(
    (current: WorkspaceSecondaryInternalState) =>
      mountedRef.current && stackRef.current.at(-1)?.instanceKey === current.instanceKey,
    [],
  );

  const restoreFocus = useCallback((target: WorkspaceFocusTarget | null, expectedDepth: number) => {
    if (!target || typeof requestAnimationFrame !== 'function') return;

    let attempts = 0;
    const focusWhenLayerIsVisible = () => {
      if (!mountedRef.current || stackRef.current.length !== expectedDepth) return;

      const element = resolveFocusTarget(target);
      if (element) {
        element.focus();
        if (document.activeElement === element) return;
      }

      attempts += 1;
      if (attempts < 4) requestAnimationFrame(focusWhenLayerIsVisible);
    };

    requestAnimationFrame(focusWhenLayerIsVisible);
  }, []);

  const setSecondary = useCallback(
    async (surface: AppWorkspaceSurface, options?: WorkspaceSecondaryOptions) => {
      if (!mountedRef.current) return false;
      const returnFocusTo = getActiveElement();
      const current = stackRef.current.at(-1);

      if (current) {
        if (!(await passesCloseGuard(current)) || !isCurrentTop(current)) return false;
        current.onClose?.();
        if (!isCurrentTop(current)) return false;
      }

      const next = createEntry(surface, options, returnFocusTo);
      publishStack(current ? [...stackRef.current.slice(0, -1), next] : [next]);
      publishTransition(current ? 'replace' : 'push', current, next);
      return true;
    },
    [createEntry, isCurrentTop, passesCloseGuard, publishStack, publishTransition],
  );

  const pushSecondary = useCallback(
    (surface: AppWorkspaceSurface, options?: WorkspaceSecondaryOptions) => {
      if (!mountedRef.current) return Promise.resolve(false);
      const current = stackRef.current.at(-1);
      const next = createEntry(surface, options);
      publishStack([...stackRef.current, next]);
      publishTransition('push', current, next);
      return Promise.resolve(true);
    },
    [createEntry, publishStack, publishTransition],
  );

  const popSecondary = useCallback(async () => {
    const current = stackRef.current.at(-1);
    if (!current) return mountedRef.current;
    if (!(await passesCloseGuard(current)) || !isCurrentTop(current)) return false;

    const nextStack = stackRef.current.slice(0, -1);
    const incoming = nextStack.at(-1);
    publishStack(nextStack);
    publishTransition('pop', current, incoming);
    current.onClose?.();
    restoreFocus(current.returnFocusTo, nextStack.length);
    return true;
  }, [isCurrentTop, passesCloseGuard, publishStack, publishTransition, restoreFocus]);

  const closeSecondary = useCallback(async () => {
    const current = stackRef.current.at(-1);
    if (!current) return mountedRef.current;
    if (!(await passesCloseGuard(current)) || !isCurrentTop(current)) return false;

    const rootFocusTarget = stackRef.current[0]?.returnFocusTo ?? current.returnFocusTo;
    const closing = [...stackRef.current].reverse();
    publishStack([]);
    publishTransition('close', current, undefined);
    closing.forEach((entry) => entry.onClose?.());
    restoreFocus(rootFocusTarget, 0);
    return true;
  }, [isCurrentTop, passesCloseGuard, publishStack, publishTransition, restoreFocus]);

  const publicStack = useMemo<WorkspaceSecondaryState[]>(
    () => stack.map(({ surface, instanceKey }) => ({ surface, instanceKey })),
    [stack],
  );
  const publicSecondary = publicStack.at(-1) ?? null;

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      secondary: publicSecondary,
      secondaryStack: publicStack,
      secondaryDepth: publicStack.length,
      canGoBack: publicStack.length > 1,
      transition,
      setSecondary,
      pushSecondary,
      popSecondary,
      closeSecondary,
    }),
    [
      closeSecondary,
      popSecondary,
      publicSecondary,
      publicStack,
      pushSecondary,
      setSecondary,
      transition,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace must be used within AppWorkspaceProvider');
  return workspace;
}

export function useOptionalWorkspace() {
  return useContext(WorkspaceContext);
}
