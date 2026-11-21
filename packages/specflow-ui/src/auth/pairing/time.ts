import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatRelativeTime } from '../../shared/operations/panel/relativeTime';
import { readDeviceName } from './deviceName';

/** Whole seconds until `at` (never negative); ticks once a second while it is in the future. */
export function useSecondsUntil(at: number | undefined, clock: () => number = Date.now): number {
  // The state only re-renders each second; the answer is read from the clock when rendering.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (at === undefined || clock() >= at) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setTick((tick) => tick + 1);
      if (clock() >= at) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [at, clock]);

  return at === undefined ? 0 : Math.max(0, Math.ceil((at - clock()) / 1000));
}

/** "1:48". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));

  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

/** "in 4 minutes": the wait before the next try, rounded up to whole minutes. */
export function useWaitPhrase(): (seconds: number) => string {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';

  return (seconds) =>
    new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(
      Math.max(1, Math.ceil(seconds / 60)),
      'minute',
    );
}

/** "12 seconds ago" in the language of the UI. */
export function useAgePhrase(): (iso: string) => string {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';

  return (iso) => formatRelativeTime(iso, Date.now(), locale) ?? iso;
}

/** "Safari on iPhone", or the words for a browser that cannot be read. */
export function useDeviceLabel(): (userAgent: string | undefined) => string {
  const { t } = useTranslation();

  return (userAgent) => {
    const { browser, system } = readDeviceName(userAgent);
    if (browser && system) {
      return t('pairing.device.browserOn', { browser, system });
    }

    return browser ?? system ?? t('pairing.device.unknown');
  };
}

/** "Nov 12" (with the year when it is not this one). */
export function useShortDate(): (iso: string) => string {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';

  return (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }

    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    }).format(date);
  };
}
