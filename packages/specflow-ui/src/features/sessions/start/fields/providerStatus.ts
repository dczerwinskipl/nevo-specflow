import { message, type Message } from '../../../../i18n/message';
import type { StartCatalogue, StartProvider } from '../catalogue/startCatalogue';

export interface ProviderStatus {
  /** How the provider is accessed; absent when the catalogue does not state it (never a filler). */
  readonly access: Message | undefined;
  /**
   * Availability label. The catalogue's reason text of an unavailable provider replaces the generic
   * label as it is (catalogue data, not interface copy).
   */
  readonly availability: Message | string;
  /** Decorative indicator tone for the availability; unavailable providers carry no dot. */
  readonly tone: 'info' | 'success' | undefined;
  /** A caveat of an available provider, or what to do about an unavailable one. */
  readonly note: Message | string | undefined;
}

function nonEmpty(value?: Message | string) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

const accessLabels = {
  api: message('create.provider.accessApi'),
  subscription: message('create.provider.accessSubscription'),
} as const;

/**
 * Projects catalogue fields into card text. Nothing is invented: an unstated access method or an
 * unknown quota is simply not shown (no "unknown" filler).
 */
export function providerStatus(
  provider: Pick<StartProvider, 'available' | 'access' | 'reason' | 'hint'>,
  catalogue: Pick<StartCatalogue, 'demo'>,
): ProviderStatus {
  const access = provider.access ? accessLabels[provider.access] : undefined;
  const reason = nonEmpty(provider.reason);
  if (!provider.available) {
    return {
      access: undefined,
      availability: reason ?? message('create.provider.unavailable'),
      tone: undefined,
      note: nonEmpty(provider.hint),
    };
  }

  return {
    access,
    availability: message(
      catalogue.demo ? 'create.provider.availableDemo' : 'create.provider.available',
    ),
    tone: catalogue.demo ? 'info' : 'success',
    note: reason,
  };
}
