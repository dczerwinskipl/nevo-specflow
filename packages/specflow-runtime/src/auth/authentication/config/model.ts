export type AuthMode = 'none' | 'required';

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

export interface RuntimeAuthConfig {
  readonly mode: AuthMode;
  readonly localUserId?: string;
  readonly users: Readonly<Record<string, RuntimeUserConfig>>;
  readonly providers: {
    readonly password: RuntimePasswordProviderConfig;
    readonly oidc: RuntimeOidcProviderConfig;
  };
}
