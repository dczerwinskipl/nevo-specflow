import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { message, type Message } from '../../../i18n/message';

type Provider = DemoCatalogue['providers'][number];

export interface ProviderStatus {
  /** How the provider is accessed; absent when the contract does not state it (never a filler). */
  readonly access: Message | undefined;
  /**
   * Availability label. The catalogue's reason text of an unavailable provider replaces the generic
   * label as it is (catalogue data, not interface copy).
   */
  readonly availability: Message | string;
  /** Decorative indicator tone for the availability; unavailable providers carry no dot. */
  readonly tone: 'info' | 'success' | undefined;
  /** Extra contract reason shown for an available provider (e.g. a caveat). */
  /** Catalogue-authored caveat text, shown as it is. */
  readonly note: string | undefined;
}

function nonEmpty(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

const accessLabels = {
  api: message('create.provider.accessApi'),
  subscription: message('create.provider.accessSubscription'),
} as const;

/**
 * Projects catalogue fields into card text. Nothing is invented: an unstated access method or an
 * unknown quota is simply not shown (no "unknown" filler); the contract has no known quota state.
 */
export function providerStatus(
  provider: Pick<Provider, 'available' | 'connection' | 'reason'>,
  catalogue: Pick<DemoCatalogue, 'demo'>,
): ProviderStatus {
  const access =
    provider.connection === 'api' || provider.connection === 'subscription'
      ? accessLabels[provider.connection]
      : undefined;
  const reason = nonEmpty(provider.reason);
  if (!provider.available)
    return {
      access: undefined,
      availability: reason ?? message('create.provider.unavailable'),
      tone: undefined,
      note: undefined,
    };
  return {
    access,
    availability: message(
      catalogue.demo ? 'create.provider.availableDemo' : 'create.provider.available',
    ),
    tone: catalogue.demo ? 'info' : 'success',
    note: reason,
  };
}
