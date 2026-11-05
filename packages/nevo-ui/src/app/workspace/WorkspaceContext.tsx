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
import {
  isCurrentEntry,
  popEntry,
  popToDepth,
  pushEntry,
  replaceEntry,
  startFlow,
  type SecondaryFlowModel,
} from './secondaryNavigationModel';
import { CompactWorkspaceActions, WorkspaceHeader, WorkspaceHeaderFrame } from './WorkspaceHeader';
import type {
  WorkspaceHeaderAction,
  WorkspaceHeaderLabels,
  WorkspaceHeaderMenu,
} from './WorkspaceHeader';
import type {
  SecondaryData,
  SecondaryLocalNavigation,
  SecondaryPageArgs,
  SecondaryStackActions,
  SecondaryStackDefinition,
} from './SecondaryStack';
import { createScopeOperationQueue } from './scopeOperationQueue';
import { useWorkspaceBrowserHistory } from './useWorkspaceBrowserHistory';
import { SecondaryScrollMemoryContext, createSecondaryScrollMemory } from './secondaryScrollMemory';
import {
  resolveLocalNavigation,
  resolveTabTitle,
  resolveTrail,
  type SecondaryTrailItem,
} from './secondaryTrail';

export type { SecondaryTrailItem } from './secondaryTrail';

interface RuntimePage {
  title: string;
  breadcrumbLabel?: (params: object) => string;
  actions?: (props: { data: unknown; params: object }) => readonly WorkspaceHeaderAction[];
  actionLabels?: Partial<WorkspaceHeaderLabels>;
  menu?: WorkspaceHeaderMenu;
  preserveOnDataLoss?: boolean;
  header?: ComponentType<{ data: unknown; params: object }>;
  detailHeader?: ComponentType<{ data: unknown; params: object }>;
  component: ComponentType<{ data: unknown; params: object }>;
}

interface RuntimeDefinition {
  id: string;
  initial: string;
  /** Opt-in: derives `openTab`'s tab identity from its params (see `tabInstanceId` below). */
  instanceId?: (params: object) => string;
  /** Opt-in: the tab strip/switcher label, derived from root params (see `resolveTabTitle`). */
  tabLabel?: (rootParams: object) => string;
  /** Opt-in local-depth presentation (see `SecondaryStackDefinition.localNavigation`). */
  localNavigation?: SecondaryLocalNavigation;
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
  definition: RuntimeDefinition;
  rootParams: object;
  page: string;
  params: object;
  instanceKey: number;
  returnFocusTo: WorkspaceFocusTarget | null;
}

type SecondaryFlow = SecondaryFlowModel<SecondaryEntry>;

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

/** One entry of `WorkspaceContextValue.tabs.tabs` (contract §4.1). */
export interface SecondaryTabInfo {
  id: string;
  /** `false` only for the pinned tab (contract §3). */
  closable: boolean;
  /**
   * The tab's stable label: its stack ROOT's title (`tabLabel(rootParams)`, else the initial page's
   * `title`) at any depth. Deeper levels are named by `WorkspaceContextValue.trail`, not here.
   */
  title: string;
}

/** The ordered Secondary root-tab set and which one is active (contract §4.1). */
export interface SecondaryTabsState {
  tabs: readonly SecondaryTabInfo[];
  activeTabId: string | null;
}

export interface WorkspaceContextValue {
  secondary: WorkspaceSecondaryState | null;
  secondaryDepth: number;
  /**
   * Counts how many times the provider's `scopeKey` changed since it mounted. State owned by a
   * consumer that is scoped like the Secondary flow (contract §3: "per `scopeKey`, reset when it
   * changes") resets when this changes, even if that consumer stays mounted.
   */
  scopeGeneration: number;
  canGoBack: boolean;
  /**
   * The active runtime tab's local stack, root first: one titled level per entry
   * (`trail.length === secondaryDepth`). Empty while no runtime tab is shown.
   */
  trail: readonly SecondaryTrailItem[];
  /**
   * How the split Secondary shows the active tab's local depth: the stack the tab was opened with
   * declares it (`SecondaryStackDefinition.localNavigation`), default `back`.
   */
  localNavigation: SecondaryLocalNavigation;
  transition: WorkspaceTransition;
  /**
   * Unchanged signature AND unchanged observable behavior from today: always creates-or-replaces
   * the single reserved "legacy open slot" tab, regardless of which `definition`/`params` is
   * passed. Existing callers (contract §8) observe zero behavior change.
   */
  open: <TRoot extends object, TData, TPages extends { [K in keyof TPages]: object }>(
    definition: SecondaryStackDefinition<TRoot, TData, TPages>,
    params: TRoot,
  ) => Promise<boolean>;
  /**
   * Opens or activates a root tab keyed by a `tabInstanceId` derived from `definition.id`
   * (+ `definition.instanceId(params)` when provided): a brand-new id creates and activates a tab;
   * an already-open id activates it, leaving its flow untouched (it is never retargeted, so two
   * objects that must be separate tabs need different instance ids). Showing a different tab
   * leaves the visible one, so its leave guard is consulted first (a refusal resolves `false`).
   */
  openTab: <TRoot extends object, TData, TPages extends { [K in keyof TPages]: object }>(
    definition: SecondaryStackDefinition<TRoot, TData, TPages>,
    params: TRoot,
  ) => Promise<boolean>;
  tabs: SecondaryTabsState;
  /**
   * Switches the active tab without touching any flow. Unknown ids are ignored. Leaving the visible
   * tab consults its leave guard first (its screen unmounts when it is not the active one); a
   * refusal resolves `false` and keeps it shown.
   */
  activateTab: (id: string) => Promise<boolean>;
  /**
   * Closes one tab (consulting its own leave guard). A `closable: false` tab (the pinned one)
   * resolves `false` unconditionally. Closing the active tab activates its right neighbour, else
   * its left one, else the pinned tab if one exists.
   */
  closeTab: (id: string) => Promise<boolean>;
  back: () => Promise<boolean>;
  /**
   * Pops the active tab's local stack back to `depth` levels (1 = its root) in ONE transition — a
   * breadcrumb jump. Only the current page's leave guard is consulted (ancestors are not mounted).
   * Resolves `false` for a depth that is not an ancestor level (`< 1` or `>= secondaryDepth`).
   */
  backTo: (depth: number) => Promise<boolean>;
  /** Closes the whole Secondary region. Tabs/flows survive hidden; reopening restores them. */
  close: () => Promise<boolean>;
  /** Application route blockers may call this before an ordinary route change. */
  canLeaveScope: () => Promise<boolean>;
}

type LeaveGuard = () => boolean | Promise<boolean>;
type NavigationTarget =
  | { kind: 'page'; page: string; params?: object }
  | { kind: 'stack'; definition: RuntimeDefinition; rootParams: object }
  | { kind: 'depth'; depth: number };

type NavigationCommand = (
  kind: 'push' | 'replace' | 'back' | 'backTo' | 'close',
  flowId: number,
  entryKey: number,
  target?: NavigationTarget,
) => Promise<boolean>;

interface ActiveScreenNavigation {
  flowId: number;
  entryKey: number;
  navigate: NavigationCommand;
  registerGuard: (entryKey: number, guard: LeaveGuard) => () => void;
}

// Reserved tab ids, distinct from any product-chosen `SecondaryStackDefinition.id` /
// `tabInstanceId` (contract §4.1): the legacy `open()` slot is one fixed key shared by every
// `open` call; the pinned entry (contract §3) has no flow of its own at all.
const LEGACY_OPEN_TAB_ID = '$workspace-open$';
const PINNED_TAB_ID = '$workspace-pinned$';

interface TabRecord {
  flow: SecondaryFlow;
}

/**
 * The runtime ("legacy open() slot" + `openTab()`-opened) tab collection for one scope. The
 * pinned entry (contract §3) is tracked separately (see `useRegisterPinnedSecondaryTab`) since it
 * has no flow — it is folded into the public `tabs`/`activeTabId` alongside this collection.
 */
interface TabsSnapshot {
  /**
   * The scope generation (see `WorkspaceContextValue.scopeGeneration`) that owns this snapshot. A
   * generation, not the `scopeKey` itself: A → B → A is two scope changes, and the second visit of
   * A must not inherit anything from the first.
   */
  generation: number;
  /** Runtime tab ids (legacy slot + `openTab()` entries), in creation order. */
  order: readonly string[];
  byId: Readonly<Record<string, TabRecord>>;
  /** A runtime id, `PINNED_TAB_ID`, or `null`. Survives `isOpen` becoming `false`. */
  activeTabId: string | null;
  /** Whole-region visibility. `false` hides the region without discarding anything (contract §9.3). */
  isOpen: boolean;
}

/** A scope's starting state: no runtime tab; the pinned tab, when registered, is the active one. */
function emptyTabsSnapshot(generation: number, hasPinnedTab = false): TabsSnapshot {
  return {
    generation,
    order: [],
    byId: {},
    activeTabId: hasPinnedTab ? PINNED_TAB_ID : null,
    isOpen: true,
  };
}

/** The active tab's own record, or `null` when the active tab is pinned, unknown, or hidden. */
function activeRuntimeTab(snapshot: TabsSnapshot): TabRecord | null {
  if (!snapshot.isOpen || snapshot.activeTabId === null) {
    return null;
  }

  return snapshot.byId[snapshot.activeTabId] ?? null;
}

function findTabByFlowId(
  snapshot: TabsSnapshot,
  flowId: number,
): readonly [string, TabRecord] | null {
  for (const id of snapshot.order) {
    const record = snapshot.byId[id];
    if (record?.flow.id === flowId) {
      return [id, record];
    }
  }

  return null;
}

function replaceTabFlow(snapshot: TabsSnapshot, tabId: string, flow: SecondaryFlow): TabsSnapshot {
  return { ...snapshot, byId: { ...snapshot.byId, [tabId]: { flow } } };
}

function tabInstanceId(definition: RuntimeDefinition, params: object): string {
  const suffix = definition.instanceId?.(params);

  return suffix === undefined ? definition.id : `${definition.id}:${suffix}`;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const ScreenNavigationContext = createContext<ActiveScreenNavigation | null>(null);
interface ScreenResolvedData {
  result: SecondaryData<unknown>;
  actions: readonly WorkspaceHeaderAction[];
  actionLabels?: Partial<WorkspaceHeaderLabels>;
  menu?: WorkspaceHeaderMenu;
}

const ScreenDataContext = createContext<ScreenResolvedData | null>(null);

/** Input for `useRegisterPinnedSecondaryTab`. */
export interface PinnedSecondaryTabInput {
  title: string;
}

// Lets a declarative Secondary host register the pinned tab described by the
// workspace-dynamic-split contract (§3, §9 item 2). Not part of the public `WorkspaceContextValue`
// contract (§4.1 lists no such method): a product registers it with `useRegisterPinnedSecondaryTab`
// (Session Context is the one consumer today) and `AppWorkspace` folds it into `tabs`.
const PinnedSecondaryTabRegistrationContext = createContext<
  ((pinned: PinnedSecondaryTabInput | null) => void) | null
>(null);

/**
 * Registers (or, with `null`, unregisters) the pinned Secondary tab for the nearest
 * `AppWorkspaceProvider`. The pinned tab is `closable: false`, is never created/destroyed by
 * `open`/`openTab`/`closeTab`, and becomes the active tab whenever nothing else is (contract §3,
 * §9 item 2).
 */
export function useRegisterPinnedSecondaryTab(pinned: PinnedSecondaryTabInput | null) {
  const register = useContext(PinnedSecondaryTabRegistrationContext);
  if (!register) {
    throw new Error('useRegisterPinnedSecondaryTab must be used within AppWorkspaceProvider');
  }

  const title = pinned?.title;
  useLayoutEffect(() => {
    register(title !== undefined ? { title } : null);

    return () => register(null);
  }, [register, title]);
}

function ScreenDataHost({ entry, children }: PropsWithChildren<{ entry: SecondaryEntry }>) {
  const result = entry.definition.useData(entry.rootParams);
  const page = entry.definition.screens[entry.page];
  if (!page) {
    throw new Error(`Unknown Secondary screen: ${entry.page}`);
  }

  const actions =
    result.status === 'ready'
      ? (page.actions?.({ data: result.data, params: entry.params }) ?? [])
      : [];

  return (
    <ScreenDataContext.Provider
      value={{ result, actions, actionLabels: page.actionLabels, menu: page.menu }}
    >
      {children}
    </ScreenDataContext.Provider>
  );
}

function useScreenData() {
  const resolved = useContext(ScreenDataContext);
  if (!resolved) {
    throw new Error('Secondary screen must be rendered inside ScreenDataHost');
  }

  return resolved;
}

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
    if (!isInteractiveLayerElement(candidate)) {
      return false;
    }

    if (
      target.layerKey &&
      candidate.closest<HTMLElement>('[data-workspace-layer]')?.dataset.workspaceLayer !==
        target.layerKey
    ) {
      return false;
    }

    if (target.ariaLabel && candidate.getAttribute('aria-label') !== target.ariaLabel) {
      return false;
    }

    if (target.name && candidate.getAttribute('name') !== target.name) {
      return false;
    }

    if (!target.ariaLabel && !target.name) {
      const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text !== target.text) {
        return false;
      }
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
  const { result } = useScreenData();
  const screen = entry.definition.screens[entry.page];
  const lastReady = useRef<{ status: 'ready'; data: unknown } | null>(null);
  if (result.status === 'ready') {
    lastReady.current = result;
  } else if (result.status === 'unavailable' || result.status === 'access-denied') {
    lastReady.current = null;
  }

  const navigation = useMemo<ActiveScreenNavigation>(
    () => ({ flowId: flow.id, entryKey: entry.instanceKey, navigate, registerGuard }),
    [flow.id, entry.instanceKey, navigate, registerGuard],
  );

  if (!screen) {
    throw new Error(`Unknown Secondary screen: ${entry.page}`);
  }

  let notice: ReactNode = null;
  if (result.status === 'loading') {
    notice =
      result.presentation !== undefined ? result.presentation : <div role="status">Loading…</div>;
  } else if (result.status === 'unavailable') {
    notice = <div role="status">{result.message ?? 'This item is no longer available.'}</div>;
  } else if (result.status === 'access-denied') {
    notice = <div role="alert">{result.message ?? 'Access to this item has been revoked.'}</div>;
  } else if (result.status === 'error') {
    notice = (
      <div role="alert">
        <p>{result.message ?? 'Unable to load this item.'}</p>
        {result.retry ? (
          <button type="button" onClick={result.retry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  // Editors may opt in: keep the existing mounted draft and leave guard alive, but
  // do not display stale data or enable editing while the source is unavailable.
  const preserve =
    screen.preserveOnDataLoss &&
    lastReady.current !== null &&
    (result.status === 'ready' || result.status === 'loading' || result.status === 'error');
  const Component = screen.component;
  const visible = result.status === 'ready';
  const data = visible ? result.data : lastReady.current?.data;

  return (
    <ScreenNavigationContext.Provider value={navigation}>
      {notice}
      {preserve ? (
        <div className="h-full min-h-0 min-w-0" hidden={!visible} inert={!visible}>
          <Component data={data} params={entry.params} />
        </div>
      ) : visible ? (
        <Component data={result.data} params={entry.params} />
      ) : null}
    </ScreenNavigationContext.Provider>
  );
}

function HeaderOutlet({ entry }: { entry: SecondaryEntry }) {
  const { result, actions, actionLabels, menu } = useScreenData();
  const page = entry.definition.screens[entry.page];
  if (!page) {
    throw new Error(`Unknown Secondary screen: ${entry.page}`);
  }

  if (result.status !== 'ready' || !page.header) {
    return (
      <WorkspaceHeader
        headingLevel={2}
        title={page.title}
        actions={actions}
        labels={actionLabels}
        menu={menu}
      />
    );
  }

  const Header = page.header;

  return (
    <WorkspaceHeaderFrame
      actions={actions}
      labels={actionLabels}
      menu={menu}
      content={<Header data={result.data} params={entry.params} />}
    />
  );
}

/** The screen's declared `detailHeader`; nothing when it declares none. */
function DetailHeaderOutlet({ entry }: { entry: SecondaryEntry }) {
  const { result } = useScreenData();
  const page = entry.definition.screens[entry.page];
  if (!page) {
    throw new Error(`Unknown Secondary screen: ${entry.page}`);
  }

  if (result.status !== 'ready' || !page.detailHeader) {
    return null;
  }

  const DetailHeader = page.detailHeader;

  return <DetailHeader data={result.data} params={entry.params} />;
}

function CompactScreenActions({
  className,
  navigationAction,
}: {
  className?: string;
  navigationAction?: WorkspaceHeaderAction;
}) {
  const { actions, actionLabels, menu } = useScreenData();

  return (
    <CompactWorkspaceActions
      actions={actions}
      labels={actionLabels}
      menu={menu}
      className={className}
      navigationAction={navigationAction}
    />
  );
}

function publicEntry(
  flow: SecondaryFlow,
  entry: SecondaryEntry,
  navigate: NavigationCommand,
  registerGuard: ActiveScreenNavigation['registerGuard'],
): WorkspaceSecondaryState {
  const page = entry.definition.screens[entry.page];
  if (!page) {
    throw new Error(`Unknown Secondary screen: ${entry.page}`);
  }

  return {
    instanceKey: entry.instanceKey,
    surface: {
      wrap: (children) => <ScreenDataHost entry={entry}>{children}</ScreenDataHost>,
      header: <HeaderOutlet entry={entry} />,
      detailHeader: <DetailHeaderOutlet entry={entry} />,
      renderCompactActions: (props) => <CompactScreenActions {...props} />,
      content: (
        <ScreenOutlet flow={flow} entry={entry} navigate={navigate} registerGuard={registerGuard} />
      ),
    },
  };
}

/** How many workspace `back()` calls hide the region: the active runtime tab's stack length. */
function backDistance(snapshot: TabsSnapshot): number {
  return activeRuntimeTab(snapshot)?.flow.entries.length ?? 0;
}

export interface AppWorkspaceProviderProps {
  scopeKey?: string | number;
  /**
   * Opt-in: mirror the Secondary's own Back into browser history, so browser Back / the Android
   * back gesture steps back inside the Secondary (sub-page → parent → hide) before leaving the page.
   * Each step a workspace `back()` would undo adds one same-URL entry; UI Back/Close consumes it.
   * Enable it on exactly one provider per page (the screen's own); only the first enabled provider
   * mounted owns history. See secondary-navigation.md, "Browser and system Back".
   */
  browserHistory?: boolean;
}

export function AppWorkspaceProvider({
  children,
  scopeKey,
  browserHistory = false,
}: PropsWithChildren<AppWorkspaceProviderProps>) {
  // Scope ownership. Everything a scope owns is tied to its generation, which is derived during
  // render (no effect): a scope change bumps the generation — and creates the new scope's own scroll
  // memory — in the same render that first sees the new `scopeKey`, so consumers never paint, nor
  // restore, one frame of the old scope's state. Its tab snapshot (`tabsRef`/`tabsState`), leave
  // guards and navigation queue are invalidated by the layout effect below, before any operation of
  // the new scope can run; every operation is bound to the generation it was created in.
  const [scopeIdentity, setScopeIdentity] = useState(() => ({
    scopeKey,
    generation: 0,
    scrollMemory: createSecondaryScrollMemory(),
  }));
  let { generation: scopeGeneration, scrollMemory } = scopeIdentity;
  if (scopeIdentity.scopeKey !== scopeKey) {
    scopeGeneration += 1;
    scrollMemory = createSecondaryScrollMemory();
    setScopeIdentity({ scopeKey, generation: scopeGeneration, scrollMemory });
  }

  const [tabsState, setTabsState] = useState<TabsSnapshot>(() => emptyTabsSnapshot(0));
  const [pinnedTab, setPinnedTab] = useState<PinnedSecondaryTabInput | null>(null);
  const tabsRef = useRef<TabsSnapshot>(tabsState);
  const pinnedTabRef = useRef(pinnedTab);
  const counter = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  /** The generation the committed tree belongs to; operations of any other one are stale. */
  const currentGeneration = useRef(scopeGeneration);
  const guards = useRef(new Map<number, LeaveGuard>());
  /** One serial chain per generation, ended with its scope (see `scopeOperationQueue`). */
  const [operations] = useState(() => createScopeOperationQueue(scopeGeneration));
  const [transition, setTransition] = useState<WorkspaceTransition>({
    action: 'close',
    revision: 0,
    incoming: null,
    outgoing: null,
  });

  useEffect(() => {
    mounted.current = true;
    // The map is created once and only mutated: this is the instance to clear on unmount.
    const registeredGuards = guards.current;

    return () => {
      mounted.current = false;
      registeredGuards.clear();
      // A caller still waiting (e.g. on a guard whose dialog unmounted with us) gets `false`.
      operations.endAll();
    };
  }, [operations]);

  // Route/owner scope invalidation is not a user-initiated close: clear even if
  // the old screen has a leave guard. No stale screen may affect the new scope.
  // That includes a Secondary that is still sliding out after its flow was closed.
  // Unconditional on a scope change: a scope showing only the pinned tab has no runtime tab, but its
  // snapshot (and pinned selection) still belongs to it.
  useLayoutEffect(() => {
    if (currentGeneration.current === scopeGeneration) {
      return;
    }

    currentGeneration.current = scopeGeneration;
    // Every operation of the old scope settles `false` now, without waiting for its guard.
    operations.endBefore(scopeGeneration);
    const hadRuntimeTabs = tabsRef.current.order.length > 0;
    // The pinned-tab effect below, which runs next in this same commit, re-selects the pinned tab.
    tabsRef.current = emptyTabsSnapshot(scopeGeneration);
    guards.current.clear();
    setTabsState(tabsRef.current);

    revision.current += 1;
    const revisionAtChange = revision.current;
    setTransition((previous) =>
      hadRuntimeTabs || previous.outgoing
        ? { action: 'close', revision: revisionAtChange, incoming: null, outgoing: null }
        : previous,
    );
  }, [operations, scopeGeneration]);

  // The pinned tab becomes active when nothing else is, and yields to a runtime tab (or nothing)
  // once it disappears; it is never created/destroyed by open/openTab/closeTab (contract §3).
  useLayoutEffect(() => {
    pinnedTabRef.current = pinnedTab;
    const previous = tabsRef.current;
    if (previous.generation !== scopeGeneration) {
      return;
    }

    if (pinnedTab && previous.activeTabId === null) {
      tabsRef.current = { ...previous, activeTabId: PINNED_TAB_ID, isOpen: true };
      setTabsState(tabsRef.current);
    } else if (!pinnedTab && previous.activeTabId === PINNED_TAB_ID) {
      // Nothing took its place: a background runtime tab must not be pulled into view (or the
      // region reopened) just because the pinned tab went away. The region hides; registering the
      // pinned tab again (the `activeTabId === null` branch above) reopens it.
      tabsRef.current = { ...previous, activeTabId: null, isOpen: false };
      setTabsState(tabsRef.current);
    }
  }, [pinnedTab, scopeGeneration]);

  const registerGuard = useCallback((entryKey: number, guard: LeaveGuard) => {
    guards.current.set(entryKey, guard);

    return () => {
      if (guards.current.get(entryKey) === guard) {
        guards.current.delete(entryKey);
      }
    };
  }, []);

  const restoreFocus = useCallback(
    (target: WorkspaceFocusTarget | null, expectedKey: number | null) => {
      if (!target || typeof requestAnimationFrame !== 'function') {
        return;
      }

      let attempts = 0;
      // A focus return belongs to the scope that scheduled it, never to the next one.
      const generation = currentGeneration.current;
      const tryFocus = () => {
        if (!mounted.current || currentGeneration.current !== generation) {
          return;
        }

        const active = activeRuntimeTab(tabsRef.current)?.flow.entries.at(-1)?.instanceKey ?? null;
        if (active !== expectedKey) {
          return;
        }

        const element = resolveFocusTarget(target);
        if (element) {
          element.focus();
          if (document.activeElement === element) {
            return;
          }
        }

        attempts += 1;
        if (attempts < 4) {
          requestAnimationFrame(tryFocus);
        }
      };

      requestAnimationFrame(tryFocus);
    },
    [],
  );

  const navigateRef = useRef<NavigationCommand>(() => Promise.resolve(false));

  const currentSurfaceForFlow = useCallback(
    (flow: SecondaryFlow | null) => {
      const entry = flow?.entries.at(-1);

      return flow && entry
        ? publicEntry(flow, entry, (...args) => navigateRef.current(...args), registerGuard)
        : null;
    },
    [registerGuard],
  );

  /**
   * Commits a new snapshot. `outgoingFlow`/`incomingFlow` are explicit, not derived from "whatever
   * was active": merely switching which already-open tab is shown (`activateTab`, `openTab`
   * re-activating an existing instance, `openTab` backgrounding the previous tab behind a new one)
   * discards nothing, so it must not hand `AppWorkspace` an "outgoing" surface — that slot means
   * "this screen instance is being discarded," which today's `AppWorkspace`/mobile transition
   * plumbing (unaware tabs exist) would otherwise keep exit-animating indefinitely in the
   * background for a tab that is still fully alive.
   */
  const publishTabs = useCallback(
    (
      next: TabsSnapshot,
      action: WorkspaceTransition['action'],
      outgoingFlow: SecondaryFlow | null,
      incomingFlow: SecondaryFlow | null,
    ) => {
      const outgoing = currentSurfaceForFlow(outgoingFlow);
      const incoming = currentSurfaceForFlow(incomingFlow);
      tabsRef.current = next;
      setTabsState(next);
      revision.current += 1;
      setTransition({ action, revision: revision.current, incoming, outgoing });
    },
    [currentSurfaceForFlow],
  );

  /**
   * Serialises one scope's operations; a scope change settles every operation of the old scope
   * `false` without waiting for it (`scopeOperationQueue`). Operation bodies therefore re-check
   * `isCurrentScope` after every await: one may resume after its caller was already told `false`.
   */
  const queue = useCallback(
    (generation: number, operation: () => Promise<boolean>) =>
      operations.run(generation, operation),
    [operations],
  );

  /** The operation's scope is still the committed one (and the provider is mounted). */
  const isCurrentScope = useCallback(
    (generation: number) => mounted.current && currentGeneration.current === generation,
    [],
  );

  const passesGuard = useCallback(async (flow: SecondaryFlow | null) => {
    const key = flow?.entries.at(-1)?.instanceKey;
    const guard = key === undefined ? undefined : guards.current.get(key);

    return guard ? await guard() : true;
  }, []);

  /**
   * Leaving the VISIBLE runtime tab for another one: its screen unmounts (only the active tab is
   * mounted), so the switch asks that tab's own leave guard first, exactly as closing it would.
   * Nothing to ask when the target is the visible tab itself, when the region is hidden, or when
   * the visible tab is the pinned one (it has no flow).
   */
  const passesVisibleTabGuard = useCallback(
    (targetTabId: string) => {
      const snapshot = tabsRef.current;
      const visibleId = snapshot.isOpen ? snapshot.activeTabId : null;
      const leaving =
        visibleId !== null && visibleId !== targetTabId ? (snapshot.byId[visibleId] ?? null) : null;

      return passesGuard(leaving?.flow ?? null);
    },
    [passesGuard],
  );

  /** Removes one tab from the collection, activating its neighbour (else the pinned tab, else none). */
  const applyCloseTab = useCallback(
    (tabId: string, snapshot: TabsSnapshot, returnFocusTo: WorkspaceFocusTarget | null) => {
      const record = snapshot.byId[tabId];
      if (!record) {
        return false;
      }

      const closedIndex = snapshot.order.indexOf(tabId);
      const order = snapshot.order.filter((id) => id !== tabId);
      const byId = { ...snapshot.byId };
      delete byId[tabId];
      const closedTopKey = record.flow.entries.at(-1)?.instanceKey;
      if (closedTopKey !== undefined) {
        guards.current.delete(closedTopKey);
      }

      scrollMemory.forgetTab(tabId);

      const wasActive = snapshot.activeTabId === tabId;
      let activeTabId = snapshot.activeTabId;
      if (wasActive) {
        // Right neighbour, else left (useOpenedItems's rule, verbatim); only when no runtime tab
        // remains at all does the pinned tab become the fallback (contract §4.1/§5).
        const neighborTabId = order[Math.min(closedIndex, order.length - 1)] ?? null;
        activeTabId = neighborTabId ?? (pinnedTabRef.current ? PINNED_TAB_ID : null);
      }

      const nextSnapshot: TabsSnapshot = { ...snapshot, order, byId, activeTabId };
      // Only the closed tab's own surface ever "exits": closing a background tab changes nothing
      // visible, and the newly-activated neighbour (if any) simply appears, it does not animate in.
      publishTabs(nextSnapshot, 'close', wasActive ? record.flow : null, null);
      // The opener gets focus back only when the closed tab was the active one and nothing is left
      // to show: otherwise the tab strip's own neighbour rule (`item-tabs.md`, "Focus after
      // close") owns focus, and a background close moves it nowhere.
      if (wasActive && activeTabId === null) {
        restoreFocus(returnFocusTo, null);
      }

      return true;
    },
    [publishTabs, restoreFocus, scrollMemory],
  );

  const open = useCallback<WorkspaceContextValue['open']>(
    (definition, params) =>
      queue(scopeGeneration, async () => {
        if (!isCurrentScope(scopeGeneration)) {
          return false;
        }

        const snapshot = tabsRef.current;
        const existingLegacy = snapshot.byId[LEGACY_OPEN_TAB_ID] ?? null;
        if (
          !(await passesGuard(existingLegacy?.flow ?? null)) ||
          !isCurrentScope(scopeGeneration) ||
          // Another visible tab is left (unmounted) by showing the legacy slot.
          !(await passesVisibleTabGuard(LEGACY_OPEN_TAB_ID)) ||
          !isCurrentScope(scopeGeneration)
        ) {
          return false;
        }

        // Type erasure is confined to the infrastructure boundary; the public signature is typed.
        const runtime = definition as unknown as RuntimeDefinition;
        if (!runtime.screens[runtime.initial]) {
          throw new Error(`Unknown initial Secondary screen: ${runtime.initial}`);
        }

        const entry: SecondaryEntry = {
          definition: runtime,
          rootParams: { ...params },
          page: runtime.initial,
          params: {},
          instanceKey: ++counter.current,
          returnFocusTo: getActiveElement(),
        };
        const nextFlow = startFlow(++counter.current, entry, scopeKey);

        // Re-read after the async guard: another queued operation may have changed things meanwhile.
        const latest = tabsRef.current;
        // Reproduces today's single-flow push/replace classification byte-for-byte: 'replace' only
        // when the legacy slot was the visible active tab right before this call (not merely
        // whether a record for it still exists — closing hides without discarding it, contract §9.3).
        const wasVisible = latest.isOpen && latest.activeTabId === LEGACY_OPEN_TAB_ID;
        const oldLegacyFlow = latest.byId[LEGACY_OPEN_TAB_ID]?.flow ?? null;
        const oldTopKey = oldLegacyFlow?.entries.at(-1)?.instanceKey;
        if (oldTopKey !== undefined) {
          guards.current.delete(oldTopKey);
        }

        // The slot starts a new flow: whatever its previous entries had scrolled is gone.
        scrollMemory.forgetTab(LEGACY_OPEN_TAB_ID);

        const nextSnapshot: TabsSnapshot = {
          generation: scopeGeneration,
          order: latest.order.includes(LEGACY_OPEN_TAB_ID)
            ? latest.order
            : [...latest.order, LEGACY_OPEN_TAB_ID],
          byId: { ...latest.byId, [LEGACY_OPEN_TAB_ID]: { flow: nextFlow } },
          activeTabId: LEGACY_OPEN_TAB_ID,
          isOpen: true,
        };
        // 'replace' only (and only then an outgoing surface) when the legacy slot was visible
        // right before this call; a brand-new/backgrounded-then-reopened slot has nothing exiting.
        publishTabs(
          nextSnapshot,
          wasVisible ? 'replace' : 'push',
          wasVisible ? oldLegacyFlow : null,
          nextFlow,
        );

        return true;
      }),
    [
      isCurrentScope,
      passesGuard,
      passesVisibleTabGuard,
      publishTabs,
      queue,
      scopeGeneration,
      scopeKey,
      scrollMemory,
    ],
  );

  const openTab = useCallback<WorkspaceContextValue['openTab']>(
    (definition, params) =>
      queue(scopeGeneration, async () => {
        if (!isCurrentScope(scopeGeneration)) {
          return false;
        }

        const runtime = definition as unknown as RuntimeDefinition;
        const id = tabInstanceId(runtime, params);
        if (id === LEGACY_OPEN_TAB_ID || id === PINNED_TAB_ID) {
          throw new Error(`"${id}" collides with a reserved Secondary tab id.`);
        }

        const current = tabsRef.current;
        if (current.byId[id] && current.activeTabId === id && current.isOpen) {
          return true; // Already shown: nothing is left, nothing to ask.
        }

        if (!runtime.screens[runtime.initial] && !current.byId[id]) {
          throw new Error(`Unknown initial Secondary screen: ${runtime.initial}`);
        }

        // Showing this tab leaves the visible one (its screen unmounts): ask its guard, for the
        // switch to an open tab and for a new tab alike.
        if (!(await passesVisibleTabGuard(id)) || !isCurrentScope(scopeGeneration)) {
          return false;
        }

        // Re-read after the async guard: another queued operation may have changed things meanwhile.
        const snapshot = tabsRef.current;
        const existing = snapshot.byId[id];
        if (existing) {
          // Already open: activate it, leaving its flow untouched (`useOpenedItems.open`'s rule).
          // Nothing is discarded by switching to it: no outgoing surface.
          publishTabs(
            { ...snapshot, activeTabId: id, isOpen: true },
            'replace',
            null,
            existing.flow,
          );

          return true;
        }

        const entry: SecondaryEntry = {
          definition: runtime,
          rootParams: { ...params },
          page: runtime.initial,
          params: {},
          instanceKey: ++counter.current,
          returnFocusTo: getActiveElement(),
        };
        const nextFlow = startFlow(++counter.current, entry, scopeKey);
        const nextSnapshot: TabsSnapshot = {
          generation: scopeGeneration,
          order: [...snapshot.order, id],
          byId: { ...snapshot.byId, [id]: { flow: nextFlow } },
          activeTabId: id,
          isOpen: true,
        };
        // The previously active tab (if any) is only backgrounded, not discarded: no outgoing.
        publishTabs(nextSnapshot, 'push', null, nextFlow);

        return true;
      }),
    [isCurrentScope, passesVisibleTabGuard, publishTabs, queue, scopeGeneration, scopeKey],
  );

  const activateTab = useCallback<WorkspaceContextValue['activateTab']>(
    (id) =>
      queue(scopeGeneration, async () => {
        if (!isCurrentScope(scopeGeneration)) {
          return false;
        }

        const current = tabsRef.current;
        if (current.generation !== scopeGeneration) {
          return false;
        }

        const isPinned = id === PINNED_TAB_ID && pinnedTabRef.current !== null;
        if (!current.byId[id] && !isPinned) {
          return false; // Unknown id: ignored, mirroring `useOpenedItems.activate`.
        }

        // Showing another tab leaves the visible one (its screen unmounts): ask its guard first.
        if (!(await passesVisibleTabGuard(id)) || !isCurrentScope(scopeGeneration)) {
          return false;
        }

        // Re-read after the async guard; the target may have been closed meanwhile.
        const snapshot = tabsRef.current;
        if (snapshot.generation !== scopeGeneration || (!snapshot.byId[id] && !isPinned)) {
          return false;
        }

        // A tab switch discards nothing: no outgoing surface.
        publishTabs(
          { ...snapshot, activeTabId: id, isOpen: true },
          'replace',
          null,
          snapshot.byId[id]?.flow ?? null,
        );

        return true;
      }),
    [isCurrentScope, passesVisibleTabGuard, publishTabs, queue, scopeGeneration],
  );

  const closeTab = useCallback<WorkspaceContextValue['closeTab']>(
    (id) =>
      queue(scopeGeneration, async () => {
        if (!isCurrentScope(scopeGeneration)) {
          return false;
        }

        const snapshot = tabsRef.current;
        if (snapshot.generation !== scopeGeneration) {
          return false;
        }

        const record = snapshot.byId[id];
        if (!record) {
          // Unknown id, or the pinned tab (never in `byId`, `closable: false`): nothing to guard,
          // refuse unconditionally.
          return false;
        }

        if (!(await passesGuard(record.flow)) || !isCurrentScope(scopeGeneration)) {
          return false;
        }

        const latest = tabsRef.current;
        if (latest.generation !== scopeGeneration || !latest.byId[id]) {
          return false;
        }

        return applyCloseTab(id, latest, record.flow.entries[0]?.returnFocusTo ?? null);
      }),
    [applyCloseTab, isCurrentScope, passesGuard, queue, scopeGeneration],
  );

  const navigate = useCallback<NavigationCommand>(
    (kind, flowId, entryKey, target) =>
      queue(scopeGeneration, async () => {
        if (!isCurrentScope(scopeGeneration)) {
          return false;
        }

        const snapshot = tabsRef.current;
        if (snapshot.generation !== scopeGeneration) {
          return false;
        }

        const found = findTabByFlowId(snapshot, flowId);
        if (!found) {
          return false; // Stale callback: this tab no longer exists.
        }

        const [, record] = found;
        const previousFlow = record.flow;
        const current = previousFlow.entries.at(-1);
        if (!current || !isCurrentEntry(previousFlow, flowId, entryKey)) {
          return false; // Stale callbacks cannot mutate a newer flow or page.
        }

        // A breadcrumb jump to a level that is not an ancestor changes nothing, so it must not
        // consult (and possibly prompt) the leave guard either.
        const targetDepth = target?.kind === 'depth' ? target.depth : 0;
        if (kind === 'backTo' && !popToDepth(previousFlow, targetDepth)) {
          return false;
        }

        if (!(await passesGuard(previousFlow)) || !isCurrentScope(scopeGeneration)) {
          return false;
        }

        const latest = tabsRef.current;
        if (latest.generation !== scopeGeneration) {
          return false;
        }

        const latestFound = findTabByFlowId(latest, flowId);
        if (!latestFound || !isCurrentEntry(latestFound[1].flow, flowId, entryKey)) {
          return false;
        }

        const [tabId] = latestFound;
        // A stale callback acting on a tab that is not the currently visible one (another tab is
        // active, or the region is hidden) changes only that tab's own data; nothing visible
        // transitions, so neither an outgoing nor an incoming surface is reported.
        const isVisible = latest.isOpen && latest.activeTabId === tabId;

        if (kind === 'close' || (kind === 'back' && previousFlow.entries.length === 1)) {
          if (!isVisible) {
            // This tab is not what the user is looking at (contract: stale-callback isolation
            // holds per tab, independently). Closing it must not hide the region another, visible
            // tab is currently showing — it only discards this one tab, like `closeTab` would.
            return applyCloseTab(tabId, latest, previousFlow.entries[0]?.returnFocusTo ?? null);
          }

          // Region-level hide: tabs/flows survive, so reopening restores them (contract §9 item 3).
          // Only reached for the currently visible tab, matching today's single-flow behavior where
          // "close this flow" and "close the region" were the same thing.
          const nextSnapshot: TabsSnapshot = { ...latest, isOpen: false };
          publishTabs(nextSnapshot, 'close', previousFlow, null);
          restoreFocus(previousFlow.entries[0]?.returnFocusTo ?? null, null);

          return true;
        }

        if (kind === 'back') {
          const nextFlow = popEntry(previousFlow)!;
          const nextSnapshot = replaceTabFlow(latest, tabId, nextFlow);
          publishTabs(
            nextSnapshot,
            'pop',
            isVisible ? previousFlow : null,
            isVisible ? nextFlow : null,
          );
          guards.current.delete(current.instanceKey);
          scrollMemory.forget(tabId, current.instanceKey);
          restoreFocus(current.returnFocusTo, nextFlow.entries.at(-1)?.instanceKey ?? null);

          return true;
        }

        if (kind === 'backTo') {
          // One 'pop' transition for the whole jump: the levels in between are never shown, and
          // the browser-history mirror consumes all of their entries with one `go(-n)`.
          const nextFlow = popToDepth(previousFlow, targetDepth)!;
          publishTabs(
            replaceTabFlow(latest, tabId, nextFlow),
            'pop',
            isVisible ? previousFlow : null,
            isVisible ? nextFlow : null,
          );
          guards.current.delete(current.instanceKey);
          for (const popped of previousFlow.entries.slice(targetDepth)) {
            scrollMemory.forget(tabId, popped.instanceKey);
          }

          // Focus returns to what opened the level above the target, inside the target page.
          restoreFocus(
            previousFlow.entries[targetDepth]?.returnFocusTo ?? null,
            nextFlow.entries.at(-1)?.instanceKey ?? null,
          );

          return true;
        }

        if (!target || target.kind === 'depth') {
          throw new Error('Secondary navigation target is required.');
        }

        const definition = target.kind === 'stack' ? target.definition : current.definition;
        const page = target.kind === 'stack' ? definition.initial : target.page;
        if (!definition.screens[page]) {
          throw new Error(`Unknown Secondary screen: ${page}`);
        }

        const nextEntry: SecondaryEntry = {
          definition,
          rootParams: target.kind === 'stack' ? { ...target.rootParams } : current.rootParams,
          page,
          params: target.kind === 'stack' ? {} : { ...target.params },
          instanceKey: ++counter.current,
          returnFocusTo: getActiveElement(),
        };
        const nextFlow =
          kind === 'replace'
            ? replaceEntry(previousFlow, nextEntry)
            : pushEntry(previousFlow, nextEntry);
        const nextSnapshot = replaceTabFlow(latest, tabId, nextFlow);
        publishTabs(
          nextSnapshot,
          kind,
          isVisible ? previousFlow : null,
          isVisible ? nextFlow : null,
        );
        if (kind === 'replace') {
          guards.current.delete(current.instanceKey);
          scrollMemory.forget(tabId, current.instanceKey);
        }

        return true;
      }),
    [
      applyCloseTab,
      isCurrentScope,
      passesGuard,
      publishTabs,
      queue,
      restoreFocus,
      scopeGeneration,
      scrollMemory,
    ],
  );

  useLayoutEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const back = useCallback(() => {
    const tab = activeRuntimeTab(tabsRef.current);
    const top = tab?.flow.entries.at(-1);

    return tab && top ? navigate('back', tab.flow.id, top.instanceKey) : Promise.resolve(true);
  }, [navigate]);

  const backTo = useCallback(
    (depth: number) => {
      const tab = activeRuntimeTab(tabsRef.current);
      const top = tab?.flow.entries.at(-1);

      return tab && top
        ? navigate('backTo', tab.flow.id, top.instanceKey, { kind: 'depth', depth })
        : Promise.resolve(false);
    },
    [navigate],
  );

  const close = useCallback(() => {
    const tab = activeRuntimeTab(tabsRef.current);
    const top = tab?.flow.entries.at(-1);
    if (tab && top) {
      return navigate('close', tab.flow.id, top.instanceKey);
    }

    // The pinned tab is shown while runtime tabs wait in the background: hiding the region is
    // still "close" (tabs and `activeTabId` survive; `activateTab` reopens). A pinned tab alone
    // cannot be hidden (contract §4.1), so that stays a no-op.
    return queue(scopeGeneration, () => {
      if (!isCurrentScope(scopeGeneration)) {
        return Promise.resolve(false);
      }

      const snapshot = tabsRef.current;
      if (snapshot.isOpen && snapshot.activeTabId === PINNED_TAB_ID && snapshot.order.length > 0) {
        publishTabs({ ...snapshot, isOpen: false }, 'close', null, null);
      }

      return Promise.resolve(true);
    });
  }, [isCurrentScope, navigate, publishTabs, queue, scopeGeneration]);

  const canLeaveScope = useCallback(
    () =>
      queue(scopeGeneration, async () => {
        if (!isCurrentScope(scopeGeneration)) {
          return false;
        }

        return passesGuard(activeRuntimeTab(tabsRef.current)?.flow ?? null);
      }),
    [isCurrentScope, queue, passesGuard, scopeGeneration],
  );

  // The render that first sees a new scope (before its layout effect commits the new snapshot)
  // already shows that scope's starting state, never the old one's.
  const visibleTabsState =
    tabsState.generation === scopeGeneration
      ? tabsState
      : emptyTabsSnapshot(scopeGeneration, pinnedTab !== null);
  const activeTab = activeRuntimeTab(visibleTabsState);

  const readBackDistance = useCallback(
    () =>
      tabsRef.current.generation === currentGeneration.current ? backDistance(tabsRef.current) : 0,
    [],
  );
  useWorkspaceBrowserHistory({
    enabled: browserHistory,
    depth: backDistance(visibleTabsState),
    getDepth: readBackDistance,
    back,
  });
  // A stale (different-scope) snapshot never leaks its transition into the new scope; an entirely
  // empty one has nothing to leak in the first place.
  const stateIsCurrentOrEmpty =
    tabsState.generation === scopeGeneration || tabsState.order.length === 0;

  const value = useMemo<WorkspaceContextValue>(() => {
    const topEntry = activeTab?.flow.entries.at(-1);
    const pinnedEntry: SecondaryTabInfo[] = pinnedTab
      ? [{ id: PINNED_TAB_ID, closable: false, title: pinnedTab.title }]
      : [];
    const runtimeEntries: SecondaryTabInfo[] = visibleTabsState.order.map((id) => ({
      id,
      closable: true,
      title: resolveTabTitle(visibleTabsState.byId[id]!.flow.entries),
    }));

    return {
      secondary:
        activeTab && topEntry
          ? publicEntry(
              activeTab.flow,
              topEntry,
              (...args) => navigateRef.current(...args),
              registerGuard,
            )
          : null,
      secondaryDepth: activeTab?.flow.entries.length ?? 0,
      scopeGeneration,
      canGoBack: (activeTab?.flow.entries.length ?? 0) > 1,
      trail: activeTab ? resolveTrail(activeTab.flow.entries) : [],
      localNavigation: activeTab ? resolveLocalNavigation(activeTab.flow.entries) : 'back',
      transition: stateIsCurrentOrEmpty
        ? transition
        : { action: 'close', revision: transition.revision, incoming: null, outgoing: null },
      tabs: {
        tabs: [...pinnedEntry, ...runtimeEntries],
        activeTabId: visibleTabsState.activeTabId,
      },
      open,
      openTab,
      activateTab,
      closeTab,
      back,
      backTo,
      close,
      canLeaveScope,
    };
  }, [
    activeTab,
    activateTab,
    back,
    backTo,
    close,
    closeTab,
    canLeaveScope,
    open,
    openTab,
    pinnedTab,
    registerGuard,
    scopeGeneration,
    stateIsCurrentOrEmpty,
    transition,
    visibleTabsState,
  ]);

  return (
    <PinnedSecondaryTabRegistrationContext.Provider value={setPinnedTab}>
      <SecondaryScrollMemoryContext.Provider value={scrollMemory}>
        <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
      </SecondaryScrollMemoryContext.Provider>
    </PinnedSecondaryTabRegistrationContext.Provider>
  );
}

/** Open an entirely new contextual flow from Primary, a toolbar or another feature component. */
export function useSecondaryNavigation() {
  const workspace = useWorkspace();
  const isOpen = workspace.secondaryDepth > 0;

  return useMemo(
    () => ({
      open: workspace.open,
      openTab: workspace.openTab,
      close: workspace.close,
      canLeaveScope: workspace.canLeaveScope,
      tabs: workspace.tabs,
      activateTab: workspace.activateTab,
      closeTab: workspace.closeTab,
      /** A contextual flow is open now (false as soon as it closes, even while it slides out). */
      isOpen,
    }),
    [
      workspace.open,
      workspace.openTab,
      workspace.close,
      workspace.canLeaveScope,
      workspace.tabs,
      workspace.activateTab,
      workspace.closeTab,
      isOpen,
    ],
  );
}

/** Navigate within the flow that mounted this screen. Old callbacks cannot affect a new flow. */
export function useSecondaryStack<
  TPages extends { [K in keyof TPages]: object },
>(): SecondaryStackActions<TPages> {
  const screen = useContext(ScreenNavigationContext);
  if (!screen) {
    throw new Error('useSecondaryStack must be used inside a Secondary screen');
  }

  return useMemo(
    () => ({
      navTo: (pageOrStack: unknown, params?: object) => {
        const target: NavigationTarget =
          typeof pageOrStack === 'string'
            ? { kind: 'page', page: pageOrStack, params }
            : {
                kind: 'stack',
                definition: pageOrStack as RuntimeDefinition,
                rootParams: params ?? {},
              };

        return screen.navigate('push', screen.flowId, screen.entryKey, target);
      },
      replace: <K extends keyof TPages & string>(page: K, ...args: SecondaryPageArgs<TPages, K>) =>
        screen.navigate('replace', screen.flowId, screen.entryKey, {
          kind: 'page',
          page,
          params: args[0],
        }),
      back: () => screen.navigate('back', screen.flowId, screen.entryKey),
      close: () => screen.navigate('close', screen.flowId, screen.entryKey),
    }),
    [screen],
  );
}

/** Optional navigation guard. It protects the active page's unsaved edits. */
export function useSecondaryLeaveGuard(guard: LeaveGuard) {
  const screen = useContext(ScreenNavigationContext);
  if (!screen) {
    throw new Error('useSecondaryLeaveGuard must be used inside a Secondary screen');
  }

  useEffect(() => screen.registerGuard(screen.entryKey, guard), [screen, guard]);
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error('useWorkspace must be used within AppWorkspaceProvider');
  }

  return workspace;
}

export function useOptionalWorkspace() {
  return useContext(WorkspaceContext);
}
