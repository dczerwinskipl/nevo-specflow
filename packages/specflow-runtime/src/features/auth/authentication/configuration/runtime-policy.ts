import { RuntimeConfigError } from '../../../../config/parsing/runtime-config-error';
import { enabledOidcProviders, type RuntimeAuthenticationConfig } from './model';

export interface AuthenticationRuntimeContext {
  readonly bindHost: string;
  readonly publicOrigin?: string;
  readonly tlsEnabled: boolean;
}

export function validateAuthenticationRuntimeContext(
  authentication: RuntimeAuthenticationConfig,
  context: AuthenticationRuntimeContext,
): void {
  if (enabledOidcProviders(authentication).length > 0 && !context.publicOrigin) {
    throw new RuntimeConfigError(
      'server.publicOrigin is required when an OIDC provider is enabled.',
    );
  }

  if (authentication.mode !== 'required' || context.tlsEnabled) {
    return;
  }

  if (!isLoopbackHost(context.bindHost)) {
    throw new RuntimeConfigError(
      'authentication.mode=required without Runtime TLS is allowed only when server.host is loopback.',
    );
  }

  if (context.publicOrigin && !isLoopbackHost(new URL(context.publicOrigin).hostname)) {
    throw new RuntimeConfigError(
      'authentication.mode=required without Runtime TLS requires server.publicOrigin to be loopback.',
    );
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, '$1');

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }

  const parts = normalized.split('.');
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^(0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255)
  );
}
