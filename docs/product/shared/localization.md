---
id: product.shared.localization
type: product
title: Localization
status: current
read_when:
  - adding user-facing copy to the CLI or UI
  - designing a message, label, or notification
  - changing locale selection or persistence
summary: >
  Localization is a standing product requirement. SpecFlow UI uses i18next with per-locale JSON
  catalogs, stable message keys, English fallback, browser-language detection, and an explicit
  persisted user preference. Reusable Nevo UI remains localization-agnostic.
related:
  - product.shared.vocabulary
  - product.specflow.cli.interaction-model
  - product.specflow.ui.interaction-model
  - product.specflow.ui.application-architecture
---

# Localization

Localization / i18n is a required product concern for Nevo SpecFlow.

## Product rules

1. **User-facing copy is localizable.** UI labels, messages, errors, notifications, empty states,
   accessibility labels, and other text intended for users must come from the owning product
   surface's message catalog. Product and brand names remain literal.
2. **Stable semantic keys are explicit.** Use keys such as `navigation.home`,
   `auth.login.password`, or `account.signOut`. Do not derive identifiers from English source
   text.
3. **Catalogs are data, not TypeScript copy containers.** SpecFlow UI locale content lives in
   separate JSON files under `packages/specflow-ui/src/i18n/locales/`. Runtime/configuration code
   must not contain parallel translation objects.
4. **Reusable UI stays localization-agnostic.** `@nevo/ui` owns mechanics, layout, and neutral
   component contracts. Product-owned copy is translated by SpecFlow UI and passed through
   component `labels` / `messages` seams where needed.
5. **Diagnostic-only text is exempt.** Log lines, stack traces, and maintainer-facing debug output
   are not user-facing copy.

## SpecFlow UI runtime

SpecFlow UI uses:

- `i18next` as the localization runtime;
- `react-i18next` as its React adapter;
- one JSON catalog per supported locale;
- English (`en`) as the fallback locale;
- English and Polish (`pl`) as the currently bundled locales.

The runtime is owned by `packages/specflow-ui/src/i18n/`. It is initialized above the router so
standalone authentication/recovery surfaces and guarded application routes use the same active
locale.

Current catalog layout:

```text
packages/specflow-ui/src/i18n/
  i18n.ts
  LocalizationProvider.tsx
  LocaleMenu.tsx
  locales/
    en.json
    pl.json
```

Do not add an i18n dependency to `@nevo/ui`.

## Locale resolution and persistence

Initial locale resolution is deterministic:

1. persisted `nevo-specflow.locale` browser preference;
2. the first supported language in `navigator.languages`;
3. English fallback.

Locale variants such as `pl-PL` and `en-US` resolve to their supported base language.

A user-selected locale is persisted in browser local storage and updates
`document.documentElement.lang`. Locale is a browser/user presentation preference; it is not
project configuration and does not belong in Runtime YAML or authorization data.

## Selection surfaces

Inside the application, locale selection lives in the account menu in the fixed navigation footer.
The footer remains visible while the navigation body scrolls and is shared by desktop navigation
and the compact/mobile drawer.

Standalone authentication and Runtime recovery routes are outside `AppShell`, so they expose the
same locale selector independently.

## CLI vs UI

The CLI and UI have different presentation constraints. They share product terminology and should
reuse stable semantic message identifiers where the same concept is exposed, but the current i18n
runtime is implemented only in SpecFlow UI.

When CLI localization is implemented, choose a CLI-appropriate adapter around the same terminology
and key conventions rather than making terminal output depend on React or on `@nevo/ui`.
