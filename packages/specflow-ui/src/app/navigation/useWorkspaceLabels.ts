import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** Localised accessible names of the `AppWorkspace` chrome (navigation, back, close secondary). */
export function useWorkspaceLabels() {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      backToPrimary: t('navigation.back'),
      closeSecondary: t('navigation.closeSecondary'),
      openNavigation: t('navigation.open'),
    }),
    [t],
  );
}
