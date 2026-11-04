import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppWorkspaceProps } from '@nevo/ui';

/** Localised accessible names of the `AppWorkspace` chrome (navigation, back, close secondary,
 * splitter, and the Secondary root-tab strip). */
export function useWorkspaceLabels(): NonNullable<AppWorkspaceProps['labels']> {
  const { t } = useTranslation();

  return useMemo(
    () => ({
      backToPrimary: t('navigation.back'),
      backToParent: (name: string) => t('navigation.backTo', { name }),
      closeSecondary: t('navigation.closeSecondary'),
      openNavigation: t('navigation.open'),
      resizeSecondary: t('navigation.resizeSecondary'),
      secondaryBreadcrumbs: {
        navigation: t('navigation.secondaryBreadcrumbs'),
        collapsed: t('navigation.secondaryBreadcrumbsCollapsed'),
      },
      secondaryTabs: {
        tablist: t('navigation.secondaryTabs.tablist'),
        openedMenu: (count: number) => t('navigation.secondaryTabs.openedMenu', { n: count }),
        openedHeading: t('navigation.secondaryTabs.openedHeading'),
        moreMenu: (count: number) => t('navigation.secondaryTabs.moreMenu', { n: count }),
        moreHeading: t('navigation.secondaryTabs.moreHeading'),
        close: (name: string) => t('navigation.secondaryTabs.close', { name }),
        closeHint: t('navigation.secondaryTabs.closeHint'),
        menuHint: t('navigation.secondaryTabs.menuHint'),
        menuClose: t('navigation.secondaryTabs.menuClose'),
        rootLocation: t('navigation.secondaryTabs.rootLocation'),
        status: {
          loading: t('navigation.secondaryTabs.statusLoading'),
          missing: t('navigation.secondaryTabs.statusMissing'),
          dirty: t('navigation.secondaryTabs.statusDirty'),
          current: t('navigation.secondaryTabs.statusCurrent'),
        },
        switcher: ({ label, count, dirty }: { label: string; count: number; dirty: boolean }) =>
          dirty
            ? t('navigation.secondaryTabs.switcherDirty', { name: label, n: count })
            : t('navigation.secondaryTabs.switcher', { name: label, n: count }),
        noItem: t('navigation.secondaryTabs.noItem'),
      },
    }),
    [t],
  );
}
