import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemTabs, type ItemTab, type ItemTabsLabels } from '@nevo/ui';
import { OutlineButton } from '../outline/OutlineButton';
import { useDocumentTabs } from './DocumentTabsProvider';

/** Ties the strip's tabs to the tab panel the workspace renders. */
export const documentTabsScope = 'documents-tabs';

/** The strip's copy, in the user's language. */
export function useDocumentTabLabels(): Partial<ItemTabsLabels> {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      tablist: t('documents.tabs.tablist'),
      openedMenu: (count) => t('documents.tabs.openedMenu', { n: count }),
      openedHeading: t('documents.tabs.openedHeading'),
      close: (name) => t('documents.tabs.close', { name }),
      closeHint: t('documents.tabs.closeHint'),
      menuHint: t('documents.tabs.menuHint'),
      menuClose: t('documents.tabs.menuClose'),
      status: {
        loading: t('documents.tabs.statusLoading'),
        missing: t('documents.tabs.statusMissing'),
        dirty: t('documents.tabs.statusDirty'),
        current: t('documents.tabs.statusCurrent'),
      },
      switcher: ({ label, count, dirty }) =>
        dirty
          ? t('documents.tabs.switcherDirty', { name: label, n: count })
          : t('documents.tabs.switcher', { name: label, n: count }),
      noItem: t('documents.tabs.noItem'),
    }),
    [t],
  );
}

/** The open documents as the content of the Secondary header: a strip, or the switcher when narrow. */
export function DocumentTabStrip({ variant = 'auto' }: { variant?: 'auto' | 'switcher' }) {
  const { t } = useTranslation();
  const tabs = useDocumentTabs();
  const labels = useDocumentTabLabels();
  const items = useMemo<ItemTab[]>(
    () =>
      tabs.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        description: tab.path,
        icon: 'file',
        dirty: tab.dirty,
        state: tab.state,
      })),
    [tabs.tabs],
  );
  const active = tabs.tabs.find((tab) => tab.id === tabs.activeId);
  return (
    <>
      {/* The region's heading: the strip is not a heading, and focus lands here after a switch. */}
      <h2 tabIndex={-1} data-workspace-header-title="true" className="sr-only outline-none">
        {active?.label ?? t('documents.title')}
      </h2>
      {/* The contents icon follows the strip (or the switcher) as region navigation. */}
      <div className="flex min-w-0 items-center gap-1">
        <div className={variant === 'switcher' ? 'min-w-0' : 'min-w-0 flex-1'}>
          <ItemTabs
            items={items}
            activeId={tabs.activeId}
            onActivate={(id) => void tabs.show(id)}
            onClose={(id) => void tabs.requestClose(id)}
            scope={documentTabsScope}
            variant={variant}
            labels={labels}
          />
        </div>
        <OutlineButton />
      </div>
    </>
  );
}
