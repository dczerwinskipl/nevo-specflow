import type { ParseKeys, TFunction } from 'i18next';
import { useCallback } from 'react';
import { getI18n, useTranslation } from 'react-i18next';

/** A catalogue key understood by the typed `t` function (plural suffixes are resolved by i18next). */
export type MessageKey = ParseKeys;

/** Interpolation value: plain text/number, or another message (lists are joined with ", "). */
export type MessageValue = string | number | Message | readonly Message[];
export type MessageValues = Readonly<Record<string, MessageValue>>;

/**
 * A translatable message produced by pure (non-React) policy modules. The policy decides WHICH
 * message applies and with which values; the component that renders it translates it with
 * {@link useMessage}, so policy code never imports the i18n singleton.
 */
export interface Message {
  readonly key: MessageKey;
  readonly values?: MessageValues;
}

export const message = (key: MessageKey, values?: MessageValues): Message =>
  values ? { key, values } : { key };

const isMessage = (value: MessageValue): value is Message =>
  typeof value === 'object' && !Array.isArray(value) && 'key' in value;

/** Translates a {@link Message} with an existing `t` function. */
export function translateMessage(t: TFunction, value: Message | string): string {
  if (typeof value === 'string') return value;
  const resolved: Record<string, string | number> = {};
  for (const [name, entry] of Object.entries(value.values ?? {})) {
    resolved[name] =
      typeof entry === 'string' || typeof entry === 'number'
        ? entry
        : isMessage(entry)
          ? translateMessage(t, entry)
          : entry.map((item) => translateMessage(t, item)).join(', ');
  }
  return (t as (key: string, options?: Record<string, string | number>) => string)(
    value.key,
    resolved,
  );
}

/** Hook form of {@link translateMessage}: `const text = useMessage(); text(policy.reason)`. */
export function useMessage(): (value: Message | string) => string {
  const { t } = useTranslation();
  return useCallback((value: Message | string) => translateMessage(t, value), [t]);
}

/**
 * Translates with the active i18n instance outside React. Only for definitions that must hand a
 * plain string to a design-system API at render time (for example a Secondary screen `title`),
 * where a hook is not available. Components use `useTranslation` / {@link useMessage} instead.
 */
export function translateNow(key: MessageKey, values?: MessageValues): string {
  const instance = getI18n();
  return translateMessage(instance.t, message(key, values));
}
