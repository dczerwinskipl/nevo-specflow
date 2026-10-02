export type AuthMode = 'none' | 'required';

export interface RuntimeServerTlsConfig {
  readonly enabled: boolean;
  readonly certFile?: string;
  readonly keyFile?: string;
}

export interface RuntimeServerConfig {
  readonly host: string;
  readonly port: number;
  readonly publicOrigin?: string;
  readonly tls: RuntimeServerTlsConfig;
}

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

export interface RuntimeOidcProviderConfig {
  readonly enabled: boolean;
  readonly issuer?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly allowedEmails: Readonly<Record<string, string>>;
}

export interface RuntimeAuthConfig {
  readonly mode: AuthMode;
  readonly localUserId?: string;
  readonly users: Readonly<Record<string, RuntimeUserConfig>>;
  readonly providers: {
    readonly password: RuntimePasswordProviderConfig;
    readonly oidc: RuntimeOidcProviderConfig;
  };
}

export interface RuntimeConfig {
  readonly server: RuntimeServerConfig;
  readonly auth: RuntimeAuthConfig;
}

export interface LoadedRuntimeConfig {
  readonly config: RuntimeConfig;
  readonly sources: {
    readonly project: string;
    readonly local?: string;
  };
}
