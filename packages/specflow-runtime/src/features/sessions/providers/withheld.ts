import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';

import type { WithheldSessionProvider } from '../configuration';
import { ProviderTitles } from './titles';

/**
 * The catalogue entry of a provider the configuration withholds: unavailable, with the reason and
 * what to change. It runs no driver, so it offers no model, mode or capability.
 */
export function withheldProviderDescriptor(withheld: WithheldSessionProvider): ProviderDescriptor {
  const key = `sessions.providers.${withheld.providerId}`;

  return {
    providerId: withheld.providerId,
    title: ProviderTitles[withheld.providerId],
    readiness: 'unavailable',
    ...(withheld.reason === 'not-allowed'
      ? {
          reasonCode: 'NOT_ALLOWED_BY_PROJECT' as const,
          reason: `The project does not allow this provider. A maintainer allows it with ${key}.allowed: true in .nevo/config.yaml, then the Runtime is restarted.`,
        }
      : {
          reasonCode: 'NOT_ENABLED_ON_WORKSTATION' as const,
          reason: `This provider is turned off on this machine. Remove ${key}.enabled: false from .nevo/local/config.yaml, then restart the Runtime.`,
        }),
    capabilities: {
      questions: false,
      permissions: false,
      cancel: false,
      resume: false,
      modelOverride: false,
      effortOverride: false,
    },
    models: [],
    modes: [],
  };
}
