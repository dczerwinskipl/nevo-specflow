export function isRequestAtPublicOrigin(
  publicOrigin: string,
  requestHost: string | undefined,
  tlsEnabled: boolean,
): boolean {
  if (!requestHost) return false;

  const protocol = tlsEnabled ? 'https:' : 'http:';
  const requestOrigin = originFromDirectHost(protocol, requestHost);
  if (!requestOrigin) return false;

  const published = new URL(publicOrigin);
  if (requestOrigin.protocol !== published.protocol) return false;
  if (effectivePort(requestOrigin) !== effectivePort(published)) return false;

  return hostsEquivalent(requestOrigin.hostname, published.hostname);
}

function originFromDirectHost(protocol: 'http:' | 'https:', host: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(`${protocol}//${host}`);
  } catch {
    return undefined;
  }

  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    return undefined;
  }

  return url;
}

function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

function hostsEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeHost(left);
  const normalizedRight = normalizeHost(right);

  if (normalizedLeft === normalizedRight) return true;
  return isLoopbackHost(normalizedLeft) && isLoopbackHost(normalizedRight);
}

function normalizeHost(host: string): string {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, '$1');
  return normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
}

function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;

  const parts = host.split('.');
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^(0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255)
  );
}
