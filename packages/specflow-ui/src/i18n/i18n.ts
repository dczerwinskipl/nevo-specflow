import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import pl from './locales/pl.json';

export const supportedLocales = ['en', 'pl'] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';
export const LOCALE_STORAGE_KEY = 'nevo-specflow.locale';

export function normalizeLocale(value: string | null | undefined): AppLocale | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace('_', '-');
  const language = normalized.split('-', 1)[0];
  return supportedLocales.find((locale) => locale === language);
}

export function resolveInitialLocale(
  storage: Pick<Storage, 'getItem'> | undefined = browserStorage(),
  languages: readonly string[] = browserLanguages(),
): AppLocale {
  try {
    const stored = normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Browser storage can be unavailable or blocked. Locale detection still works without it.
  }

  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }

  return DEFAULT_LOCALE;
}

export function createSpecFlowI18n(locale: AppLocale = resolveInitialLocale()): I18nInstance {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      pl: { translation: pl },
    },
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...supportedLocales],
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return instance;
}

export const appI18n = createSpecFlowI18n();

export async function changeLocale(
  instance: I18nInstance,
  locale: AppLocale,
  storage: Pick<Storage, 'setItem'> | undefined = browserStorage(),
): Promise<void> {
  await instance.changeLanguage(locale);

  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persistence is best-effort; changing the active locale must still succeed.
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}
