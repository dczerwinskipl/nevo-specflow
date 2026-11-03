import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { typeTitle } from '../catalogue/documentTypePolicy';
import { useDocumentCatalogue } from '../catalogue/useDocumentCatalogue';
import { ItemTabs, RailTail, cn, type ItemTab, type ItemTabsLabels } from '@nevo/ui';
import { OutlineButton } from '../outline/OutlineButton';
import { GuidanceButton } from '../guidance/GuidanceButton';
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
      rootLocation: t('documents.tabs.rootLocation'),
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

/**
 * The open documents as the content of the Secondary header: a strip, or the switcher when narrow.
 * `rail` (the split Secondary) is the editor-tab rail of the Session screen (36px, square tabs, no
 * icons, the dirty dot in place of one); the stacked header keeps the 56px header density.
 */
export function DocumentTabStrip({
  variant = 'auto',
  density = 'header',
}: {
  variant?: 'auto' | 'switcher';
  density?: 'header' | 'rail';
}) {
  const rail = density === 'rail';
  const { t } = useTranslation();
  const tabs = useDocumentTabs();
  const labels = useDocumentTabLabels();
  const catalogue = useDocumentCatalogue();
  const items = useMemo<ItemTab[]>(
    () =>
      tabs.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        // The type is in the tab's tooltip and in the Opened list (the switcher on touch).
        description: tab.type
          ? t('documents.tabs.typeAndPath', {
              type: typeTitle(catalogue.data, tab.type),
              path: tab.path,
            })
          : tab.path,
        // The rail names a file by its label and dirty dot, like the Session's tabs.
        icon: rail ? undefined : 'file',
        dirty: tab.dirty,
        state: tab.state,
      })),
    [tabs.tabs, catalogue.data, t, rail],
  );
  const active = tabs.tabs.find((tab) => tab.id === tabs.activeId);

  return (
    <>
      {/* The region's heading: the strip is not a heading, and focus lands here after a switch. */}
      <h2 tabIndex={-1} data-workspace-header-title="true" className="sr-only outline-none">
        {active?.label ?? t('documents.title')}
      </h2>
      {/* The contents and guidance icons follow the strip (or the switcher) as region navigation. */}
      {/* On the rail they sit in its tail, so the strip's fill and divider run to the edge. */}
      <div className={cn('flex min-w-0', rail ? 'items-stretch' : 'items-center gap-1')}>
        <div className={variant === 'switcher' ? 'min-w-0' : 'min-w-0 flex-1'}>
          <ItemTabs
            items={items}
            activeId={tabs.activeId}
            onActivate={(id) => void tabs.show(id)}
            onClose={(id) => void tabs.requestClose(id)}
            scope={documentTabsScope}
            variant={variant}
            density={density}
            labels={labels}
          />
        </div>
        {rail ? (
          <RailTail>
            <OutlineButton />
            <GuidanceButton />
          </RailTail>
        ) : (
          <>
            <OutlineButton />
            <GuidanceButton />
          </>
        )}
      </div>
    </>
  );
}
