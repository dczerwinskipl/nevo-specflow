import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import type { ComponentType, ReactNode } from 'react';
import type { AppWorkspaceSurface } from './workspaceSurface';
import { WorkspaceHeader } from './WorkspaceHeader';
import type {
  SecondaryData,
  SecondaryPageArgs,
  SecondaryStackActions,
  SecondaryStackDefinition,
} from './SecondaryStack';

interface RuntimePage {
  title: string;
  header?: ComponentType<{ data: unknown; params: object }>;
  component: ComponentType<{ data: unknown; params: object }>;
}

interface RuntimeDefinition {
  id: string;
  initial: string;
  useData: (params: object) => SecondaryData<unknown>;
  screens: Record<string, RuntimePage>;
}

interface WorkspaceFocusTarget {
  element: HTMLElement;
  ariaLabel: string | null;
  layerKey: string | null;
  name: string | null;
  tagName: string;
  text: string;
}

interface SecondaryEntry {
  page: string;
  params: object;
  instanceKey: number;
  returnFocusTo: WorkspaceFocusTarget | null;
}

interface SecondaryFlow {
  id: number;
  definition: RuntimeDefinition;
  rootParams: object;
  entries: readonly SecondaryEntry[];
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

export interface WorkspaceContextValue {
  secondary: WorkspaceSecondaryState | null;
  secondaryDepth: number;
  canGoBack: boolean;
  transition: WorkspaceTransition;
  open: <TRoot extends object, TData, TPages extends { [K in keyof TPages]: object }>(
    definition: SecondaryStackDefinition<TRoot, TData, TPages>,
    params: TRoot,
  ) => Promise<boolean>;
  back: () => Promise<boolean>;
  close: () => Promise<boolean>;
}

type LeaveGuard = () => boolean | Promise<boolean>;
type NavigationCommand = (
  kind: 'push' | 'replace' | 'back' | 'close',
  flowId: number,
  entryKey: number,
  page?: string,
  params?: object,
) => Promise<boolean>;

interface ActiveScreenNavigation {
  flowId: number;
  entryKey: number;
  navigate: NavigationCommand;
  registerGuard: (entryKey: number, guard: LeaveGuard) => () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const ScreenNavigationContext = createContext<ActiveScreenNavigation | null>(null);

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

function ScreenOutlet({
  flow,
  entry,
  navigate,
  registerGuard,
}: {
  flow: SecondaryFlow;
  entry: SecondaryEntry;
  navigate: NavigationCommand;
  registerGuard: ActiveScreenNavigation['registerGuard'];
}) {
  // A different flow gets a different host. A refetch within one entry never changes this host.
  const result = flow.definition.useData(flow.rootParams);
  const screen = flow.definition.screens[entry.page];
  const navigation = useMemo<ActiveScreenNavigation>(
    () => ({ flowId: flow.id, entryKey: entry.instanceKey, navigate, registerGuard }),
    [flow.id, entry.instanceKey, navigate, registerGuard],
  );

  if (!screen) throw new Error(`Unknown Secondary screen: ${entry.page}`);

  let content: ReactNode;
  if (result.status === 'loading') {
    content = <div role="status">Loading…</div>;
  } else if (result.status === 'unavailable') {
    content = <div role="status">{result.message ?? 'This item is no longer available.'}</div>;
  } else if (result.status === 'error') {
    content = (
      <div role="alert">
        <p>{result.message ?? 'Unable to load this item.'}</p>
        {result.retry ? (
          <button type="button" onClick={result.retry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  } else {
    const Component = screen.component;
    content = <Component data={result.data} params={entry.params} />;
  }

  return (
    <ScreenNavigationContext.Provider value={navigation}>
      {content}
    </ScreenNavigationContext.Provider>
  );
}

function HeaderOutlet({ flow, entry }: { flow: SecondaryFlow; entry: SecondaryEntry }) {
  const result = flow.definition.useData(flow.rootParams);
  const page = flow.definition.screens[entry.page];
  if (!page) throw new Error(`Unknown Secondary screen: ${entry.page}`);
  if (result.status !== 'ready' || !page.header) {
    return <WorkspaceHeader title={page.title} />;
  }
  const Header = page.header;
  return <Header data={result.data} params={entry.params} />;
}

function publicEntry(
  flow: SecondaryFlow,
  entry: SecondaryEntry,
  navigate: NavigationCommand,
  registerGuard: ActiveScreenNavigation['registerGuard'],
): WorkspaceSecondaryState {
  const page = flow.definition.screens[entry.page];
  if (!page) throw new Error(`Unknown Secondary screen: ${entry.page}`);
  return {
    instanceKey: entry.instanceKey,
    surface: {
      header: page.header ? (
        <HeaderOutlet flow={flow} entry={entry} />
      ) : (
        <WorkspaceHeader title={page.title} />
      ),
      content: (
        <ScreenOutlet flow={flow} entry={entry} navigate={navigate} registerGuard={registerGuard} />
      ),
    },
  };
}

export function AppWorkspaceProvider({ children }: PropsWithChildren) {
  const [flow, setFlow] = useState<SecondaryFlow | null>(null);
  const flowRef = useRef<SecondaryFlow | null>(null);
  const counter = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  const guards = useRef(new Map<number, LeaveGuard>());
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const [transition, setTransition] = useState<WorkspaceTransition>({
    action: 'close',
    revision: 0,
    incoming: null,
    outgoing: null,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flowRef.current = null;
      guards.current.clear();
    };
  }, []);

  const registerGuard = useCallback((entryKey: number, guard: LeaveGuard) => {
    guards.current.set(entryKey, guard);
    return () => {
      if (guards.current.get(entryKey) === guard) guards.current.delete(entryKey);
    };
  }, []);

  const restoreFocus = useCallback(
    (target: WorkspaceFocusTarget | null, expectedKey: number | null) => {
      if (!target || typeof requestAnimationFrame !== 'function') return;
      let attempts = 0;
      const tryFocus = () => {
        if (!mounted.current) return;
        const active = flowRef.current?.entries.at(-1)?.instanceKey ?? null;
        if (active !== expectedKey) return;
        const element = resolveFocusTarget(target);
        if (element) {
          element.focus();
          if (document.activeElement === element) return;
        }
        attempts += 1;
        if (attempts < 4) requestAnimationFrame(tryFocus);
      };
      requestAnimationFrame(tryFocus);
    },
    [],
  );

  const navigateRef = useRef<NavigationCommand>(() => Promise.resolve(false));

  const currentSurface = useCallback(
    (current: SecondaryFlow | null) => {
      const entry = current?.entries.at(-1);
      return current && entry
        ? publicEntry(current, entry, (...args) => navigateRef.current(...args), registerGuard)
        : null;
    },
    // navigate is stable; the callback is resolved when invoked, not during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registerGuard],
  );

  const publish = useCallback(
    (
      next: SecondaryFlow | null,
      action: WorkspaceTransition['action'],
      previous: SecondaryFlow | null,
    ) => {
      const outgoing = currentSurface(previous);
      const incoming = currentSurface(next);
      flowRef.current = next;
      setFlow(next);
      revision.current += 1;
      setTransition({
        action,
        revision: revision.current,
        incoming,
        outgoing,
      });
    },
    [currentSurface],
  );

  const queue = useCallback((operation: () => Promise<boolean>) => {
    const result = pending.current.then(operation, operation);
    pending.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  const passesGuard = useCallback(async (previous: SecondaryFlow | null) => {
    const key = previous?.entries.at(-1)?.instanceKey;
    const guard = key === undefined ? undefined : guards.current.get(key);
    return guard ? await guard() : true;
  }, []);

  const open = useCallback<WorkspaceContextValue['open']>(
    (definition, params) =>
      queue(async () => {
        if (!mounted.current) return false;
        const previous = flowRef.current;
        if (!(await passesGuard(previous)) || !mounted.current) return false;
        // Type erasure is confined to the infrastructure boundary; the public signature is typed.
        const runtime = definition as unknown as RuntimeDefinition;
        if (!runtime.screens[runtime.initial]) {
          throw new Error(`Unknown initial Secondary screen: ${runtime.initial}`);
        }
        const entry: SecondaryEntry = {
          page: runtime.initial,
          params: {},
          instanceKey: ++counter.current,
          returnFocusTo: getActiveElement(),
        };
        const next: SecondaryFlow = {
          id: ++counter.current,
          definition: runtime,
          rootParams: { ...params },
          entries: [entry],
        };
        guards.current.clear();
        publish(next, previous ? 'replace' : 'push', previous);
        return true;
      }),
    [passesGuard, publish, queue],
  );

  const navigate = useCallback<NavigationCommand>(
    (kind, flowId, entryKey, page, params) =>
      queue(async () => {
        if (!mounted.current) return false;
        const previous = flowRef.current;
        const current = previous?.entries.at(-1);
        if (!previous || !current || previous.id !== flowId || current.instanceKey !== entryKey) {
          return false; // Stale callbacks cannot mutate a newer flow or page.
        }
        if (!(await passesGuard(previous)) || !mounted.current) return false;
        if (kind === 'close' || (kind === 'back' && previous.entries.length === 1)) {
          publish(null, 'close', previous);
          guards.current.clear();
          restoreFocus(previous.entries[0]?.returnFocusTo ?? null, null);
          return true;
        }
        if (kind === 'back') {
          const nextEntries = previous.entries.slice(0, -1);
          const next = { ...previous, entries: nextEntries };
          publish(next, 'pop', previous);
          guards.current.delete(current.instanceKey);
          restoreFocus(current.returnFocusTo, nextEntries.at(-1)?.instanceKey ?? null);
          return true;
        }
        if (!page || !previous.definition.screens[page]) {
          throw new Error(`Unknown Secondary screen: ${page ?? '<none>'}`);
        }
        const nextEntry: SecondaryEntry = {
          page,
          params: { ...params },
          instanceKey: ++counter.current,
          returnFocusTo: getActiveElement(),
        };
        const entries =
          kind === 'replace'
            ? [...previous.entries.slice(0, -1), nextEntry]
            : [...previous.entries, nextEntry];
        publish({ ...previous, entries }, kind, previous);
        if (kind === 'replace') guards.current.delete(current.instanceKey);
        return true;
      }),
    [passesGuard, publish, queue, restoreFocus],
  );

  useLayoutEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const back = useCallback(() => {
    const top = flowRef.current?.entries.at(-1);
    const id = flowRef.current?.id;
    return id && top ? navigate('back', id, top.instanceKey) : Promise.resolve(true);
  }, [navigate]);

  const close = useCallback(() => {
    const top = flowRef.current?.entries.at(-1);
    const id = flowRef.current?.id;
    return id && top ? navigate('close', id, top.instanceKey) : Promise.resolve(true);
  }, [navigate]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      secondary: currentSurface(flow),
      secondaryDepth: flow?.entries.length ?? 0,
      canGoBack: (flow?.entries.length ?? 0) > 1,
      transition,
      open,
      back,
      close,
    }),
    [flow, transition, open, back, close, currentSurface],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Open an entirely new contextual flow from Primary, a toolbar or another feature component. */
export function useSecondaryNavigation() {
  const workspace = useWorkspace();
  return useMemo(
    () => ({ open: workspace.open, close: workspace.close }),
    [workspace.open, workspace.close],
  );
}

/** Navigate within the flow that mounted this screen. Old callbacks cannot affect a new flow. */
export function useSecondaryStack<
  TPages extends { [K in keyof TPages]: object },
>(): SecondaryStackActions<TPages> {
  const screen = useContext(ScreenNavigationContext);
  if (!screen) throw new Error('useSecondaryStack must be used inside a Secondary screen');
  return useMemo(
    () => ({
      navTo: <K extends keyof TPages & string>(page: K, ...args: SecondaryPageArgs<TPages, K>) =>
        screen.navigate('push', screen.flowId, screen.entryKey, page, args[0]),
      replace: <K extends keyof TPages & string>(page: K, ...args: SecondaryPageArgs<TPages, K>) =>
        screen.navigate('replace', screen.flowId, screen.entryKey, page, args[0]),
      back: () => screen.navigate('back', screen.flowId, screen.entryKey),
      close: () => screen.navigate('close', screen.flowId, screen.entryKey),
    }),
    [screen],
  );
}

/** Optional navigation guard. It protects the active page's unsaved edits. */
export function useSecondaryLeaveGuard(guard: LeaveGuard) {
  const screen = useContext(ScreenNavigationContext);
  if (!screen) throw new Error('useSecondaryLeaveGuard must be used inside a Secondary screen');
  useEffect(() => screen.registerGuard(screen.entryKey, guard), [screen, guard]);
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace must be used within AppWorkspaceProvider');
  return workspace;
}

export function useOptionalWorkspace() {
  return useContext(WorkspaceContext);
}
