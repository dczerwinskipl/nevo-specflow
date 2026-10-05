import { useMemo, type PropsWithChildren } from 'react';

import { createSpecFlowI18n, type AppLocale } from './i18n';
import { LocalizationProvider } from './LocalizationProvider';

export function StoryLocalization({
  children,
  locale = 'en',
}: PropsWithChildren<{ readonly locale?: AppLocale }>) {
  const instance = useMemo(() => createSpecFlowI18n(locale), [locale]);
  return <LocalizationProvider instance={instance}>{children}</LocalizationProvider>;
}
