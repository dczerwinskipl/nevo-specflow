import type { DocsConfiguration } from '@nevo/specflow-docs';

import type { RuntimeAuthenticationConfig, RuntimeAuthorizationConfig } from '../features/auth';
import type { SpecsFeatureConfig } from '../features/specs';
import type { SessionsFeatureConfig } from '../features/sessions';
import type { EndpointRateLimit } from '../server/endpoint-policy-config';

export interface RuntimeServerTlsConfig {
  readonly enabled: boolean;
  readonly certFile?: string;
  readonly keyFile?: string;
}

export interface RuntimeServerConfig {
  readonly rateLimit?: EndpointRateLimit;
  readonly host: string;
  readonly port: number;
  readonly publicOrigin?: string;
  readonly tls: RuntimeServerTlsConfig;
}

export interface RuntimeConfig {
  readonly server: RuntimeServerConfig;
  readonly authentication: RuntimeAuthenticationConfig;
  readonly authorization?: RuntimeAuthorizationConfig;
  readonly specs?: SpecsFeatureConfig;
  readonly sessions?: SessionsFeatureConfig;
  /** `docs` and `ai.embeddings` (config loading always sets it); absent: the defaults. */
  readonly docs?: DocsConfiguration;
}

export interface LoadedRuntimeConfig {
  readonly config: RuntimeConfig;
  readonly sources: {
    readonly project: string;
    readonly local?: string;
  };
}
