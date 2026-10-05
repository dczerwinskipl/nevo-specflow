import type { RuntimeAuthConfig } from '../auth/authentication/config/model';
import type { RuntimeAuthorizationConfig } from '../auth/authorization/config';
import type { SpecsOverviewGroup } from '@nevo/specflow-contracts/specs-overview';

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
  readonly authorization?: RuntimeAuthorizationConfig;
  readonly specsOverviewGroups?: readonly SpecsOverviewGroup[];
}

export interface LoadedRuntimeConfig {
  readonly config: RuntimeConfig;
  readonly sources: {
    readonly project: string;
    readonly local?: string;
  };
}
