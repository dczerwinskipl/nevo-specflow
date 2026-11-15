import type { FastifyInstance, RawServerBase } from 'fastify';

export interface RuntimeWebAppAsset {
  readonly body: Buffer;
  readonly contentType: string;
}

export interface RuntimeWebApp {
  readonly indexHtml: RuntimeWebAppAsset;
  readonly assets: ReadonlyMap<string, RuntimeWebAppAsset>;
}

/** Vite's default asset names include a content hash; only those paths are immutable. */
const HASHED_ASSET_PATH = /^\/assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/u;
const HASHED_ASSET_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

export function registerRuntimeWebApp<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  webApp: RuntimeWebApp,
): void {
  // One handler for root, client routes and built files; /api remains owned by Runtime.
  app.get('/*', (request, reply) => {
    const pathname = request.url.split('?', 1)[0] ?? '/';

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return reply.code(404).send({
        message: `Route GET:${pathname} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    const asset = webApp.assets.get(pathname);
    // Missing chunks must fail rather than responding with index.html and HTTP 200.
    if (!asset && pathname.startsWith('/assets/')) {
      return reply.code(404).send({
        message: `Route GET:${pathname} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    const selected = asset ?? webApp.indexHtml;
    reply.type(selected.contentType);
    reply.header(
      'Cache-Control',
      asset && HASHED_ASSET_PATH.test(pathname) ? HASHED_ASSET_CACHE : REVALIDATE,
    );

    // The plugin does not add Vary for every uncompressed reply (e.g. missing
    // Accept-Encoding or a small body). Caches must still distinguish variants.
    reply.header('Vary', 'Accept-Encoding');

    return reply.compress(selected.body);
  });
}
