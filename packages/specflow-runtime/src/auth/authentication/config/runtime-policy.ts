import { RuntimeConfigError } from '../../../config/error';
import type { RuntimeAuthConfig } from './model';

export interface AuthRuntimeContext {
  readonly bindHost: string;
  readonly publicOrigin?: string;
  readonly tlsEnabled: boolean;
}

export function validateAuthRuntimeContext(
  auth: RuntimeAuthConfig,
  context: AuthRuntimeContext,
): void {
  if (auth.providers.oidc.enabled && !context.publicOrigin) {
    throw new RuntimeConfigError(
      'server.publicOrigin is required when the OIDC provider is enabled.',
    );
  }

  if (auth.mode !== 'required' || context.tlsEnabled) {
    return;
  }

  if (!isLoopbackHost(context.bindHost)) {
    throw new RuntimeConfigError(
      'auth.mode=required without Runtime TLS is allowed only when server.host is loopback.',
    );
  }

  if (context.publicOrigin && !isLoopbackHost(new URL(context.publicOrigin).hostname)) {
    throw new RuntimeConfigError(
      'auth.mode=required without Runtime TLS requires server.publicOrigin to be loopback.',
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
