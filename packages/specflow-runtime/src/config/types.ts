import type { RuntimeAuthConfig } from '../auth/config.js';

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
