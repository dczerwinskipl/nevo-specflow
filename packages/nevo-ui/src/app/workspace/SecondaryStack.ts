import type { ComponentType, ReactNode } from 'react';
import type {
  WorkspaceHeaderAction,
  WorkspaceHeaderLabels,
  WorkspaceHeaderMenu,
} from './WorkspaceHeader';

export type SecondaryData<T> =
  | { status: 'loading'; presentation?: ReactNode }
  | { status: 'ready'; data: T }
  | { status: 'unavailable'; message?: ReactNode }
  | { status: 'error'; message?: ReactNode; retry?: () => void }
  | { status: 'access-denied'; message?: ReactNode };

export interface SecondaryScreenProps<TData, TParams extends object> {
  data: TData;
  params: TParams;
}

export interface SecondaryScreenDefinition<TData, TParams extends object> {
  title: string;
  /**
   * Opt-in: this entry's segment in the split Secondary's breadcrumb trail, derived from the page's
   * own params (synchronous, like `tabLabel`) — e.g. the opened object's name instead of the page
   * type's static `title`. Omit to use `title`. Not a place for a full file path: a segment is a
   * short name and truncates when long.
   */
  breadcrumbLabel?: (params: TParams) => string;
  /** Product-only header content. The workspace renders declared actions automatically. */
  header?: ComponentType<SecondaryScreenProps<TData, TParams>>;
  /**
   * Opt-in: the screen's identity (title, status) for a split Secondary with root tabs. A tab deeper
   * than its root shows this component beside Back in the non-scrolling detail header row, instead
   * of the screen rendering it at the top of its scrolling content. Every other layout (stacked,
   * breadcrumbs) keeps showing the identity in the screen's own content, where
   * `useSecondaryDetailHeaderHosted()` tells the screen whether the workspace already shows it.
   * Separate from `header`, which stays the stacked header's content.
   */
  detailHeader?: ComponentType<SecondaryScreenProps<TData, TParams>>;
  /** Pure action metadata, resolved against the same live data as Header and Content. */
  actions?: (props: SecondaryScreenProps<TData, TParams>) => readonly WorkspaceHeaderAction[];
  actionLabels?: Partial<WorkspaceHeaderLabels>;
  /** `'complete'` lists every action in the `...` menu, promoted ones included. Default: overflow only. */
  menu?: WorkspaceHeaderMenu;
  component: ComponentType<SecondaryScreenProps<TData, TParams>>;
  /** Keep an editor through loading or network errors; missing or denied content always unmounts. */
  preserveOnDataLoss?: boolean;
}

export type SecondaryScreenMap<TData, TPages extends { [K in keyof TPages]: object }> = {
  [K in keyof TPages]: SecondaryScreenDefinition<TData, TPages[K]>;
};

/** See `SecondaryStackDefinition.localNavigation`. */
export type SecondaryLocalNavigation = 'back' | 'breadcrumbs';

/**
 * A catalogue of contextual pages, not a second router.
 * Root parameters identify the entity; page parameters must not contain cached domain snapshots.
 */
export interface SecondaryStackDefinition<
  TRoot extends object,
  TData,
  TPages extends { [K in keyof TPages]: object },
> {
  id: string;
  initial: keyof TPages & string;
  /**
   * Opt-in: derives a tab's identity from its open params for `useSecondaryNavigation().openTab`,
   * so distinct params produce distinct, independently-open tabs. Omit for a definition that only
   * ever wants a single tab (the common case today, and the only case `open` ever uses — `open`
   * never consults this field).
   */
  instanceId?: (params: TRoot) => string;
  /**
   * Opt-in: the Secondary root-tab strip's label for this stack's tabs (`ItemTab.label`, shown in
   * both the tab strip and the narrow-width switcher button — item-tabs.md's "Switcher ... one
   * button `name (N)`" is this value, not a generic category name). Computed from the stack's own
   * root params the instant a tab opens — synchronously, unlike `useData`'s (possibly async)
   * result, so the tab never has to show a placeholder before it can carry the opened entity's own
   * name. Use this whenever two tabs of the same stack (`instanceId`-keyed `openTab` instances, or
   * a stack replaced-in-place by `open` across different entities) must be told apart by name, not
   * just by which one is active.
   *
   * Omit to fall back to the stack's root (initial) page `title` — adequate only when every tab of
   * this stack is always the same single instance, since `title` cannot vary by which entity is
   * open. Either way the label names the tab's ROOT and stays stable while the tab's own local stack
   * goes deeper; the deeper levels are shown by the Secondary breadcrumb trail, not the tab label.
   */
  tabLabel?: (rootParams: TRoot) => string;
  /**
   * How the split Secondary shows local depth while a tab of this stack (the stack the tab was
   * opened with) is deeper than its root. `back` (default): the detail header row, a `←`
   * Back control (named `backToParent(parent title)`) that returns to the direct parent, followed
   * by the screen's `detailHeader`; a screen that declares none shows Back alone. `breadcrumbs`: the full trail `← Root › … › Parent › Current`, for
   * stacks whose every level is a place worth jumping back to (Tasks › TASK-03 › Attempt 2 ›
   * Review), not merely because a stack is deep. Stacked/mobile layouts ignore it (header Back).
   */
  localNavigation?: SecondaryLocalNavigation;
  useData: (params: TRoot) => SecondaryData<TData>;
  screens: SecondaryScreenMap<TData, TPages>;
}

export function defineSecondaryStack<
  TRoot extends object,
  TData,
  TPages extends { [K in keyof TPages]: object },
>(definition: SecondaryStackDefinition<TRoot, TData, TPages>) {
  return definition;
}

/** A page with no parameters can be opened without passing an empty object. */
export type SecondaryPageArgs<TPages, K extends keyof TPages> = keyof TPages[K] extends never
  ? [params?: TPages[K]]
  : [params: TPages[K]];

export interface SecondaryStackActions<TPages extends { [K in keyof TPages]: object }> {
  /** Push the initial screen of another module into the same Back stack. */
  navTo<TRoot extends object, TData, TTargetPages extends { [K in keyof TTargetPages]: object }>(
    stack: SecondaryStackDefinition<TRoot, TData, TTargetPages>,
    params: TRoot,
  ): Promise<boolean>;
  navTo<K extends keyof TPages & string>(
    page: K,
    ...args: SecondaryPageArgs<TPages, K>
  ): Promise<boolean>;
  replace<K extends keyof TPages & string>(
    page: K,
    ...args: SecondaryPageArgs<TPages, K>
  ): Promise<boolean>;
  back(): Promise<boolean>;
  close(): Promise<boolean>;
}
