import { onlyKeys, record } from '../../../../config/parsing/value-parsers';

const PROVIDER_KEYS = new Set(['password', 'oidc']);
const PROJECT_AUTHENTICATION_KEYS = new Set(['mode', 'users', 'providers']);
const PROJECT_PASSWORD_KEYS = new Set(['enabled']);
const PROJECT_OIDC_KEYS = new Set(['instances']);
const PROJECT_OIDC_INSTANCE_KEYS = new Set([
  'name',
  'enabled',
  'issuer',
  'clientId',
  'allowedEmails',
]);
const LOCAL_AUTHENTICATION_KEYS = new Set(['localUserId', 'providers']);
const LOCAL_PASSWORD_KEYS = new Set(['accounts']);
const LOCAL_OIDC_KEYS = new Set(['instances']);
const LOCAL_OIDC_INSTANCE_KEYS = new Set(['clientSecret']);

export function assertProjectAuthenticationSource(value: unknown): void {
  if (value === undefined) return;

  const authentication = record(value, 'authentication');
  onlyKeys(authentication, PROJECT_AUTHENTICATION_KEYS, 'authentication');

  if (authentication.providers === undefined) return;
  const providers = record(authentication.providers, 'authentication.providers');
  onlyKeys(providers, PROVIDER_KEYS, 'authentication.providers');

  if (providers.password !== undefined) {
    const password = record(providers.password, 'authentication.providers.password');
    onlyKeys(password, PROJECT_PASSWORD_KEYS, 'authentication.providers.password');
  }

  if (providers.oidc !== undefined) {
    assertOidcOwnership(
      providers.oidc,
      'authentication.providers.oidc',
      PROJECT_OIDC_KEYS,
      PROJECT_OIDC_INSTANCE_KEYS,
    );
  }
}

export function assertLocalAuthenticationSource(value: unknown): void {
  if (value === undefined) return;

  const authentication = record(value, 'authentication');
  onlyKeys(authentication, LOCAL_AUTHENTICATION_KEYS, 'authentication');

  if (authentication.providers === undefined) return;
  const providers = record(authentication.providers, 'authentication.providers');
  onlyKeys(providers, PROVIDER_KEYS, 'authentication.providers');

  if (providers.password !== undefined) {
    const password = record(providers.password, 'authentication.providers.password');
    onlyKeys(password, LOCAL_PASSWORD_KEYS, 'authentication.providers.password');
  }

  if (providers.oidc !== undefined) {
    assertOidcOwnership(
      providers.oidc,
      'authentication.providers.oidc',
      LOCAL_OIDC_KEYS,
      LOCAL_OIDC_INSTANCE_KEYS,
    );
  }
}

function assertOidcOwnership(
  value: unknown,
  path: string,
  containerKeys: ReadonlySet<string>,
  instanceKeys: ReadonlySet<string>,
): void {
  const oidc = record(value, path);
  onlyKeys(oidc, containerKeys, path);
  if (oidc.instances === undefined) return;

  const instances = record(oidc.instances, `${path}.instances`);
  for (const [providerId, rawProvider] of Object.entries(instances)) {
    const providerPath = `${path}.instances.${providerId}`;
    const provider = record(rawProvider, providerPath);
    onlyKeys(provider, instanceKeys, providerPath);
  }
}
