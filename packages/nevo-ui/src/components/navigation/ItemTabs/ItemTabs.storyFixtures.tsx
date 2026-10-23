import type { ReactNode } from 'react';
import { Typography } from '../../foundations/Typography';
import {
  ItemTabs,
  getItemTabId,
  getItemTabPanelId,
  type ItemTab,
  type ItemTabsProps,
} from './ItemTabs';
import { useOpenedItems } from './useOpenedItems';

export function createItemTab(path: string, overrides: Partial<ItemTab> = {}): ItemTab {
  return {
    id: path,
    label: path.slice(path.lastIndexOf('/') + 1),
    description: path,
    icon: 'file',
    ...overrides,
  };
}

export const sampleItems: readonly ItemTab[] = [
  createItemTab('docs/overview.md'),
  createItemTab('docs/architecture/sign-in-flow.md', { dirty: true }),
  createItemTab('src/auth/session-token-refresh-handler.ts'),
  createItemTab('docs/decisions/0042-use-optimistic-locking.md', { state: 'loading' }),
  createItemTab('docs/archive/removed-notes.md', { state: 'missing' }),
];

export const manyItems: readonly ItemTab[] = [
  ...sampleItems,
  ...['billing', 'invoices', 'customers', 'reports', 'settings', 'audit-log'].map((name) =>
    createItemTab(`src/${name}/${name}.ts`),
  ),
];

export const SCOPE = 'item-tabs-story';

export function ItemPanel({ item }: { item: ItemTab | undefined }) {
  if (!item) return null;
  return (
    <div
      role="tabpanel"
      id={getItemTabPanelId(SCOPE, item.id)}
      aria-labelledby={getItemTabId(SCOPE, item.id)}
      tabIndex={0}
      className="p-4"
    >
      <Typography as="p" className="m-0 text-content-muted" variant="body-sm">
        Content of {item.label}
      </Typography>
    </div>
  );
}

interface ItemTabsHostProps extends Omit<ItemTabsProps, 'onActivate' | 'onClose' | 'scope'> {
  /** Async or sync answer to "may this item close?" (the host's unsaved-changes dialog). */
  guard?: (id: string) => boolean | Promise<boolean>;
  /** Places the strip and the panel into a surrounding frame (for example a workspace header). */
  frame?: (strip: ReactNode, panel: ReactNode) => ReactNode;
}

/** Stateful host used by stories: args seed `useOpenedItems`, the strip stays controlled. */
export function ItemTabsHost({ items, activeId, guard, frame, ...props }: ItemTabsHostProps) {
  const opened = useOpenedItems<ItemTab>({
    initialItems: items,
    initialActiveId: activeId,
    canClose: guard,
  });
  const active = opened.items.find((item) => item.id === opened.activeId);
  const strip = (
    <ItemTabs
      {...props}
      items={opened.items}
      activeId={opened.activeId}
      onActivate={opened.activate}
      onClose={(id) => void opened.requestClose(id)}
      scope={SCOPE}
    />
  );
  const panel = <ItemPanel item={active} />;
  return frame ? (
    frame(strip, panel)
  ) : (
    <>
      {strip}
      {panel}
    </>
  );
}
