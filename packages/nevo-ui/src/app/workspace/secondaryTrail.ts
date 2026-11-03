/**
 * Titles of a Secondary tab's local stack: the stable tab label (its ROOT's title) and the
 * per-depth breadcrumb trail. Pure; the provider feeds it the active flow's entries.
 */

interface TrailScreen {
  title: string;
  breadcrumbLabel?: (params: object) => string;
}

interface TrailDefinition {
  initial: string;
  tabLabel?: (rootParams: object) => string;
  screens: Record<string, TrailScreen>;
}

interface TrailEntry {
  definition: TrailDefinition;
  rootParams: object;
  page: string;
  params: object;
  instanceKey: number;
}

/** One level of the active tab's local stack, root first (`WorkspaceContextValue.trail`). */
export interface SecondaryTrailItem {
  /** The entry's instance key: stable for the life of that level, a valid React key. */
  key: number;
  title: string;
}

/**
 * Whether the entry at `index` is the initial page of a stack that starts there: the tab root, or
 * the first page of another module pushed with `navTo(otherStack, params)` (Task → Changes).
 */
function startsStack(entries: readonly TrailEntry[], index: number): boolean {
  const entry = entries[index];
  if (!entry || entry.page !== entry.definition.initial) {
    return false;
  }

  return index === 0 || entries[index - 1]?.definition !== entry.definition;
}

/**
 * The title of one level. A level that starts a stack uses that stack's `tabLabel(rootParams)`
 * (the opened entity's own name) when declared; any level may name itself with the screen's
 * `breadcrumbLabel(params)`; otherwise the screen's static `title`.
 */
export function resolveEntryTitle(entries: readonly TrailEntry[], index: number): string {
  const entry = entries[index];
  if (!entry) {
    return '';
  }

  if (startsStack(entries, index)) {
    const stackLabel = entry.definition.tabLabel?.(entry.rootParams);
    if (stackLabel !== undefined) {
      return stackLabel;
    }
  }

  const screen = entry.definition.screens[entry.page];

  return screen?.breadcrumbLabel?.(entry.params) ?? screen?.title ?? '';
}

/**
 * The tab label: always the ROOT level's title, so a tab keeps its name (for example "Work
 * history") while its own stack goes deeper; the deeper levels are the breadcrumb trail.
 */
export function resolveTabTitle(entries: readonly TrailEntry[]): string {
  return resolveEntryTitle(entries, 0);
}

export function resolveTrail(entries: readonly TrailEntry[]): readonly SecondaryTrailItem[] {
  return entries.map((entry, index) => ({
    key: entry.instanceKey,
    title: resolveEntryTitle(entries, index),
  }));
}
