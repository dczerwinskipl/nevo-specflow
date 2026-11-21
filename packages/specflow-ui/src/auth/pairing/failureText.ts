import { useTranslation } from 'react-i18next';

import type { PairingFailure } from './api';

/**
 * What an owner-route refusal or an unusable Runtime says, for any screen that calls the pairing or
 * owner routes (also the Ask agent and Session screens): `owner_request_refused` (the page is not
 * at the Runtime's own address), `owner_credential_required` (this browser is not paired),
 * capacity and an unreachable Runtime. Codes and rate limits are field states of each screen.
 */
export function usePairingFailureText(): (failure: PairingFailure) => string {
  const { t } = useTranslation();

  return (failure) => {
    switch (failure.kind) {
      case 'owner-request-refused':
        return t('pairing.errors.ownerRequestRefused');
      case 'owner-credential-required':
        return t('pairing.errors.ownerCredentialRequired');
      case 'capacity':
        return t('pairing.errors.capacity');
      case 'not-used':
        return t('pairing.errors.notUsed');
      default:
        return t('pairing.errors.unavailable');
    }
  };
}
