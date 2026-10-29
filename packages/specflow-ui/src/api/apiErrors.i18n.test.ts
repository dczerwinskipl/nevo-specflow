import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import pl from '../i18n/locales/pl.json';
import { apiErrorKinds } from './ApiError';

describe('apiErrors catalogue', () => {
  it.each([
    ['en', en],
    ['pl', pl],
  ])('has a title and a description for every error kind (%s)', (_language, catalogue) => {
    for (const kind of apiErrorKinds) {
      const entry = (
        catalogue.apiErrors.kind as Record<string, { title?: string; description?: string }>
      )[kind];
      expect(entry?.title, `${kind}.title`).toBeTruthy();
      expect(entry?.description, `${kind}.description`).toBeTruthy();
    }

    expect(Object.keys(catalogue.apiErrors.kind).sort()).toEqual([...apiErrorKinds].sort());
  });
});
