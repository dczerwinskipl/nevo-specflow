import { isIP } from 'node:net';

import type { RuntimeServerConfig } from '../config/types';

export function isRuntimeOwnOrigin(server: RuntimeServerConfig, publicOrigin: string): boolean {
  const url = new URL(publicOrigin);
  const runtimeProtocol = server.tls.enabled ? 'https:' : 'http:';
  if (url.protocol !== runtimeProtocol) return false;
  if (effectivePort(url) !== server.port) return false;

  return hostsAddressSameRuntime(server.host, url.hostname);
}

function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

function hostsAddressSameRuntime(bindHost: string, publicHost: string): boolean {
  const bind = normalizeHost(bindHost);
  const published = normalizeHost(publicHost);

  if (bind === published) return true;
  if (isLoopbackHost(bind) && isLoopbackHost(published)) return true;
  if (isWildcardHost(bind) && isLoopbackHost(published)) return true;
  return false;
}

function normalizeHost(host: string): string {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, '$1');
  return normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
}

function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::' || host === '0:0:0:0:0:0:0:0';
}

function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  return isIP(host) === 4 && host.split('.')[0] === '127';
}
