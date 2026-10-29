import type { IconGlyph } from '../../foundations/Icon';

export interface ItemTab {
  /** Stable identity, unique within the strip. */
  id: string;
  /** Visible name. Middle-truncated when the tab is narrower than the name. */
  label: string;
  /** Full description (for example a path): tooltip and Opened menu rows. */
  description?: string;
  /** Leading glyph. Replaced by a spinner while loading and by a warning when missing. */
  icon?: IconGlyph;
  /** Shows the attention badge on the icon (left, always visible). */
  dirty?: boolean;
  state?: 'ready' | 'loading' | 'missing';
}

export interface ItemTabsLabels {
  /** Accessible name of the tablist. */
  tablist: string;
  /** Accessible name of the overflow trigger. */
  openedMenu: (count: number) => string;
  /** Heading of the Opened menu. */
  openedHeading: string;
  /** Accessible name of one tab's close button. */
  close: (label: string) => string;
  /** Last line of every tab tooltip. */
  closeHint: string;
  /** Note at the bottom of the Opened menu. */
  menuHint: string;
  /** Pointer-only close affordance title inside Opened menu rows. */
  menuClose: string;
  /**
   * Second line of an Opened menu row whose description is just its label (an item at the root,
   * for example `overview.md`), instead of repeating the name.
   */
  rootLocation: string;
  /** Visually hidden suffixes announced after the item name. */
  status: { loading: string; missing: string; dirty: string; current: string };
  /** Accessible name of the switcher button. */
  switcher: (info: { label: string; count: number; dirty: boolean }) => string;
  /** Switcher text when no item is active. */
  noItem: string;
}

export const defaultItemTabsLabels: ItemTabsLabels = {
  tablist: 'Opened items',
  openedMenu: (count) => `Opened items (${count})`,
  openedHeading: 'Opened items',
  close: (label) => `Close ${label}`,
  closeHint: 'Close: Delete or middle-click',
  menuHint: 'Delete closes the highlighted item.',
  menuClose: 'Close',
  rootLocation: 'Root folder',
  status: {
    loading: 'loading',
    missing: 'not found',
    dirty: 'unsaved changes',
    current: 'current',
  },
  switcher: ({ label, count, dirty }) =>
    `${label}${dirty ? ', unsaved changes' : ''}, ${count} opened`,
  noItem: 'No item',
};

type LabelOverrides = Partial<Omit<ItemTabsLabels, 'status'>> & {
  status?: Partial<ItemTabsLabels['status']>;
};

export function resolveLabels(overrides: LabelOverrides | undefined): ItemTabsLabels {
  return {
    ...defaultItemTabsLabels,
    ...overrides,
    status: { ...defaultItemTabsLabels.status, ...overrides?.status },
  };
}

/** Every applicable status, so a missing item with unsaved changes announces both. */
export function statusText(item: ItemTab, labels: ItemTabsLabels) {
  return [
    item.state === 'loading' ? labels.status.loading : null,
    item.state === 'missing' ? labels.status.missing : null,
    item.dirty ? labels.status.dirty : null,
  ]
    .filter(Boolean)
    .join(', ');
}
