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

## Authoring SpecFlow UI copy

- **Namespaces follow the owning feature**: `create.*` (Create flow), `documents.*` (Documents
  explorer, editor, dialogs), `sessions.*`, `specification.*`, and so on. Shared words live in
  `common.*`. Add a section per feature instead of growing a flat list.
- **Components** call `useTranslation()`. Use interpolation (`{{name}}`) rather than string
  concatenation, and `<Trans>` with named components (`<branch/>`) only when markup sits inside a
  sentence. Do not put HTML in messages.
- **Plurals** use i18next suffixes. Polish needs `_one`, `_few`, `_many` and `_other`; every plural
  key defines all four forms in both catalogs (English repeats `other`).
- **Pure modules** (policies, error mappers, view models) never import the i18n instance. They return
  a `Message` (`message('create.workspace.errors.branchEmpty', { ... })` from `i18n/message`) or a
  discriminated reason code, and the rendering component translates it with `useMessage()`.
- **Server text is not UI copy.** The UI maps a Runtime error `code` to a catalogue key with a safe
  fallback key and never displays the server message by default.
- **Design-system strings**: Nevo UI keeps neutral English defaults; the product passes translated
  labels through the component `labels` / `messages` props. A design-system API that needs a plain
  string outside React (for example a Secondary screen `title`) uses `translateNow(key)` in a getter.
- **Formatting** of dates and numbers uses the active language (`i18n.language`), never a fixed
  locale.
- **Stories and tests** that assert text render in a fixed locale (`withLocale('pl')` decorator,
  `polishText(message)` for policy messages).

Guard rails: `i18n/catalog.test.ts` checks identical key sets, complete plural forms and that every
literal key used in source exists in both catalogs; the local ESLint rule
`specflow-i18n/no-hardcoded-copy` (`tools/eslint/no-hardcoded-copy.mjs`) rejects JSX text and
copy-bearing attributes (`aria-label`, `title`, `placeholder`, `label`, ...) written as string
literals in `packages/specflow-ui/src/**/*.tsx`.

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
