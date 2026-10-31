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
  /** Product-only header content. The workspace renders declared actions automatically. */
  header?: ComponentType<SecondaryScreenProps<TData, TParams>>;
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
   * Omit to fall back to the active page's own per-screen `title` (today's behavior, unchanged for
   * every caller that does not set this field) — adequate only when every tab of this stack is
   * always the same single instance, since `title` cannot vary by which entity is open.
   */
  tabLabel?: (rootParams: TRoot) => string;
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
