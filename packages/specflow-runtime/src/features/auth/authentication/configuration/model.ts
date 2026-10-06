export type AuthenticationMode = 'none' | 'required';

export interface RuntimeUserConfig {
  readonly name: string;
}

export interface RuntimePasswordAccountConfig {
  readonly userId: string;
  readonly passwordHash: string;
}

export interface RuntimePasswordProviderConfig {
  readonly enabled: boolean;
  readonly accounts: Readonly<Record<string, RuntimePasswordAccountConfig>>;
}

interface RuntimeOidcProviderConfigBase {
  readonly name: string;
  readonly allowedEmails: Readonly<Record<string, string>>;
}

export interface RuntimeOidcDisabledProviderConfig extends RuntimeOidcProviderConfigBase {
  readonly enabled: false;
  readonly issuer?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
}

export interface RuntimeOidcEnabledProviderConfig extends RuntimeOidcProviderConfigBase {
  readonly enabled: true;
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export type RuntimeOidcProviderConfig =
  RuntimeOidcDisabledProviderConfig | RuntimeOidcEnabledProviderConfig;

export interface RuntimeOidcProvidersConfig {
  readonly instances: Readonly<Record<string, RuntimeOidcProviderConfig>>;
}

export interface RuntimeAuthenticationConfig {
  readonly mode: AuthenticationMode;
  readonly localUserId?: string;
  readonly users: Readonly<Record<string, RuntimeUserConfig>>;
  readonly providers: {
    readonly password: RuntimePasswordProviderConfig;
    readonly oidc: RuntimeOidcProvidersConfig;
  };
}

export function enabledOidcProviders(
  authentication: RuntimeAuthenticationConfig,
): readonly (readonly [string, RuntimeOidcEnabledProviderConfig])[] {
  return Object.entries(authentication.providers.oidc.instances).flatMap(([id, provider]) =>
    provider.enabled ? ([[id, provider]] as const) : [],
  );
}
