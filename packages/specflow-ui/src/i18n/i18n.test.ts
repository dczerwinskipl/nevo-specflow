import { describe, expect, it } from 'vitest';

import {
  changeLocale,
  createSpecFlowI18n,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  resolveInitialLocale,
} from './i18n';

describe('SpecFlow localization', () => {
  it('normalizes supported browser locale variants', () => {
    expect(normalizeLocale('pl-PL')).toBe('pl');
    expect(normalizeLocale('EN_us')).toBe('en');
    expect(normalizeLocale('de-DE')).toBeUndefined();
  });

  it('prefers a persisted locale over browser languages', () => {
    const storage = { getItem: () => 'en' };
    expect(resolveInitialLocale(storage, ['pl-PL'])).toBe('en');
  });

  it('uses the first supported browser language and otherwise falls back to English', () => {
    expect(resolveInitialLocale({ getItem: () => null }, ['de-DE', 'pl-PL', 'en-US'])).toBe('pl');
    expect(resolveInitialLocale({ getItem: () => null }, ['de-DE'])).toBe('en');
  });

  it('loads independent English and Polish JSON catalogs', () => {
    expect(createSpecFlowI18n('en').t('auth.login.title')).toBe('Welcome back');
    expect(createSpecFlowI18n('pl').t('auth.login.title')).toBe('Witaj ponownie');
  });

  it('changes and persists the selected locale', async () => {
    const writes: Array<[string, string]> = [];
    const instance = createSpecFlowI18n('en');

    await changeLocale(instance, 'pl', {
      setItem: (key, value) => writes.push([key, value]),
    });

    expect(instance.t('common.retry')).toBe('Spróbuj ponownie');
    expect(writes).toEqual([[LOCALE_STORAGE_KEY, 'pl']]);
  });
});
