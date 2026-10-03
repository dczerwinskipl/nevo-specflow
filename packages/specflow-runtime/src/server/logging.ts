export interface RuntimeRequestLogSource {
  readonly method: string;
  readonly url: string;
  readonly ip: string;
  readonly socket: { readonly remotePort?: number };
}

export interface RuntimeRequestLog extends Record<string, unknown> {
  readonly method: string;
  readonly path: string;
  readonly remoteAddress: string;
  readonly remotePort?: number;
}

export function serializeRuntimeRequest(request: RuntimeRequestLogSource): RuntimeRequestLog {
  const remotePort = request.socket.remotePort;

  return {
    method: request.method,
    path: sanitizeRequestUrl(request.url),
    remoteAddress: request.ip,
    ...(typeof remotePort === 'number' ? { remotePort } : {}),
  };
}

export function sanitizeRequestUrl(url: string): string {
  const query = url.indexOf('?');
  const fragment = url.indexOf('#');
  const end = [query, fragment]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), url.length);

  return url.slice(0, end);
}
