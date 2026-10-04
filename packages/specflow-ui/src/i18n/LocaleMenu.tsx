import {
  Button,
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import { supportedLocales, type AppLocale } from './i18n';
import { useLocale } from './LocalizationProvider';

const localeLabels = {
  en: 'common.english',
  pl: 'common.polish',
} as const satisfies Record<AppLocale, string>;

export function LocaleMenuItems() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  return (
    <>
      <MenuLabel>{t('common.language')}</MenuLabel>
      <MenuRadioGroup
        value={locale}
        onValueChange={(value) => {
          if (isAppLocale(value)) void setLocale(value);
        }}
      >
        {supportedLocales.map((option) => (
          <MenuRadioItem key={option} value={option}>
            {t(localeLabels[option])}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </>
  );
}

export function StandaloneLocaleMenu() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          aria-label={t('common.changeLanguage')}
          className="uppercase"
          size="sm"
          variant="ghost"
        >
          {locale}
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <LocaleMenuItems />
      </MenuContent>
    </Menu>
  );
}

function isAppLocale(value: string): value is AppLocale {
  return supportedLocales.some((locale) => locale === value);
}
