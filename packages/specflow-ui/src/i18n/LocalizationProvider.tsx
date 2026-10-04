import { useCallback, useEffect, type PropsWithChildren } from 'react';
import type { i18n as I18nInstance } from 'i18next';
import { I18nextProvider, useTranslation } from 'react-i18next';

import {
  appI18n,
  changeLocale,
  DEFAULT_LOCALE,
  normalizeLocale,
  type AppLocale,
} from './i18n';

export function LocalizationProvider({
  children,
  instance = appI18n,
}: PropsWithChildren<{ readonly instance?: I18nInstance }>) {
  useEffect(() => {
    const syncDocumentLanguage = (language: string) => {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = normalizeLocale(language) ?? DEFAULT_LOCALE;
      }
    };

    syncDocumentLanguage(instance.resolvedLanguage ?? instance.language);
    instance.on('languageChanged', syncDocumentLanguage);
    return () => instance.off('languageChanged', syncDocumentLanguage);
  }, [instance]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

export function useLocale() {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE;
  const setLocale = useCallback(
    (nextLocale: AppLocale) => changeLocale(i18n, nextLocale),
    [i18n],
  );

  return { locale, setLocale };
}
