import type { ComponentType, ReactNode } from 'react';

export type SecondaryData<T> =
  | { status: 'loading' }
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
  /** Optional header component; resolved against the same live data as the page. */
  header?: ComponentType<SecondaryScreenProps<TData, TParams>>;
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
