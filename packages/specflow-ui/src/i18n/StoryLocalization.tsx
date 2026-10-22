import { useMemo, type ComponentType, type PropsWithChildren } from 'react';

import { createSpecFlowI18n, type AppLocale } from './i18n';
import { LocalizationProvider } from './LocalizationProvider';

export function StoryLocalization({
  children,
  locale = 'en',
}: PropsWithChildren<{ readonly locale?: AppLocale }>) {
  const instance = useMemo(() => createSpecFlowI18n(locale), [locale]);
  return <LocalizationProvider instance={instance}>{children}</LocalizationProvider>;
}

/** Storybook decorator rendering a story in a fixed locale (stories assert the text of that locale). */
export function withLocale(locale: AppLocale) {
  return function LocaleDecorator(Story: ComponentType) {
    return (
      <StoryLocalization locale={locale}>
        <Story />
      </StoryLocalization>
    );
  };
}
