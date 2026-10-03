import { onlyKeys, record } from '../../../config/value';

const PROVIDER_KEYS = new Set(['password', 'oidc']);
const PROJECT_AUTH_KEYS = new Set(['mode', 'users', 'providers']);
const PROJECT_PASSWORD_KEYS = new Set(['enabled']);
const PROJECT_OIDC_KEYS = new Set(['enabled', 'issuer', 'clientId', 'allowedEmails']);
const LOCAL_AUTH_KEYS = new Set(['localUserId', 'providers']);
const LOCAL_PASSWORD_KEYS = new Set(['accounts']);
const LOCAL_OIDC_KEYS = new Set(['clientSecret']);

export function assertProjectAuthConfigOwnership(value: unknown): void {
  if (value === undefined) return;

  const auth = record(value, 'auth');
  onlyKeys(auth, PROJECT_AUTH_KEYS, 'auth');

  if (auth.providers === undefined) return;
  const providers = record(auth.providers, 'auth.providers');
  onlyKeys(providers, PROVIDER_KEYS, 'auth.providers');

  if (providers.password !== undefined) {
    const password = record(providers.password, 'auth.providers.password');
    onlyKeys(password, PROJECT_PASSWORD_KEYS, 'auth.providers.password');
  }

  if (providers.oidc !== undefined) {
    const oidc = record(providers.oidc, 'auth.providers.oidc');
    onlyKeys(oidc, PROJECT_OIDC_KEYS, 'auth.providers.oidc');
  }
}

export function assertLocalAuthConfigOwnership(value: unknown): void {
  if (value === undefined) return;

  const auth = record(value, 'auth');
  onlyKeys(auth, LOCAL_AUTH_KEYS, 'auth');

  if (auth.providers === undefined) return;
  const providers = record(auth.providers, 'auth.providers');
  onlyKeys(providers, PROVIDER_KEYS, 'auth.providers');

  if (providers.password !== undefined) {
    const password = record(providers.password, 'auth.providers.password');
    onlyKeys(password, LOCAL_PASSWORD_KEYS, 'auth.providers.password');
  }

  if (providers.oidc !== undefined) {
    const oidc = record(providers.oidc, 'auth.providers.oidc');
    onlyKeys(oidc, LOCAL_OIDC_KEYS, 'auth.providers.oidc');
  }
}
